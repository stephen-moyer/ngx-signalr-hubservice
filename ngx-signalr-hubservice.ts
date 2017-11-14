import { Component, Injectable, EventEmitter, NgZone } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';

import 'rxjs/add/observable/of';
import 'rxjs/add/observable/fromPromise';

import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import 'rxjs/add/operator/do';

declare var $: any;
declare var Reflect: any;

//all the hubs/events we have to subscribe to when setting up the connection.
//signalr requires you to connect to all the hubs before making the connection
//so we store them in a global var. 
const allHubProperties: HubProperties[] = [];

/** Properties for the hub you're connecting to. hubName is required */
export type HubProperties = {
    /**
     * The name of the hub on the server to subscribe to.
     */
    hubName: string,

    /**
     * The events on this hub to subscribe to
     */
    subscriptions?: Array<{
        eventName: string,
        functionName: string
    }>
};

/**
 * The decorators for methods/hubs are called out of order
 * so this will either return the existing hub properties or create new ones.
 * @param target The target class
 * @param hubProperties The properties to define for the class.
 */
function getOrCreateHubProperties(target: any, hubProperties: HubProperties) {
    let properties = <HubProperties>Reflect.getMetadata("Hub", target);
    if (!properties) {
        properties = hubProperties;
        Reflect.defineMetadata("Hub", hubProperties, target);
    }
    if (!properties.subscriptions) {
        properties.subscriptions = [];
    }
    if (!properties.hubName) {
        properties.hubName = hubProperties.hubName;
    }
    return properties;
}

/**
 * Adds the hubName property to the list of hubs to subscribe to
 * We have to define hubs and subscriptions before connecting so we only need one connection for all our hubs.
 * If your service is referenced in an external module, you have to reference it somewhere in your main/core code.
 * @param hubProperties the properties for this class's subscription to the hub
 */
export function Hub(hubProperties: HubProperties) {
    return function (target: Function) {
        hubProperties = getOrCreateHubProperties(target.prototype, hubProperties);
        let existing = allHubProperties.find(props => props.hubName === hubProperties.hubName);
        if (existing) {
            existing.subscriptions.push(...hubProperties.subscriptions);
            return;
        }
        allHubProperties.push(hubProperties);
    }
}

/**
 * Subscribes to a hub event
 * @param the event to subscribe to. if null, it uses the method name
 */
export function HubSubscription(eventName?: string) {
    return function (target: Object, // The prototype of the class
        propertyKey: string, // The name of the method
        descriptor: TypedPropertyDescriptor<any>) {
        eventName = eventName || propertyKey;
        let hubProperties = getOrCreateHubProperties(target, { hubName: null });
        hubProperties.subscriptions.push({
            eventName: eventName,
            functionName: propertyKey
        });
    }
}

/** A wrapper around the hub registration that lets us invoke methods on the hub and keep our "this" reference on responses */
export type HubWrapper = {
    /* calls the method on the hub with the provided arguments */
    invoke: <T>(method: string, ...args: any[]) => Observable<T>
};

// Some helper types. not exposed outside of this class.
type eventType = { thisObj: any, callback: Function };
type eventsType = { [key: string]: eventType[] };

/**
 * Manages a connection to a signalr service, and provides easy access to its hubs and their events
 * To start, call hubService.connect();
 * Classes that want to subscribe to a hub event must have the @Hub decorator and the name of the hub to subscribe to.
 * Example class:
 * ```
 *  @Hub({ hubName: 'searchHub' })
 *  export class SearchService {
 *      private hubWrapper: HubWrapper;
 *      constructor(private hubService: HubService) {
 *          this.hubWrapper = hubService.register(this);
 *      }
 *      public startSearch(data: any): Observable<boolean> {
 *          return this.hubWrapper.invoke<boolean>('startSearch', data);
 *      }
 *      @HubSubscription()
 *      private searchUpdated(data: any) {
 *      }
 *  }
 * ```
 */
@Injectable()
export class HubService {

    /** jQuery connection. */
    private _connection: any = null;
    /** emitter for connected event */
    private connectedEmitter = new EventEmitter<boolean>();
    /** emitter for disconnected event */
    private disconnectedEmitter = new EventEmitter<boolean>();
    /** emitter for reconnecting event */
    private reconnectingEmitter = new EventEmitter<any>();
    /** emitter for reconnected event */
    private reconnectedEmitter = new EventEmitter<boolean>();
    /** if there was an error connecting */
    private _errorConnecting = false;
    /** currently trying to reconnect? */
    private tryingReconnect = false;
    /** the current state of the signalR connection */
    private reconnectingObservable: Subject<boolean>;

    /** list of services to register after connect is called */
    private deferredRegistrations = <any[]>[];

    private attemptReconnects: boolean;

    /**
     * The list of hubs keyed by name. Each entry has the jQuery hubproxy instance, and a list of
     * callbacks that we're going to push out events to
     */
    private hubProxies: {
        [key: string]: {
            hubProxy: any,
            events: eventsType
        };
    };

    get connection() {
        return this._connection;
    }

    /**
     * Is the client connected?
     */
    get connected() {
        return this._connection !== null && this._connection.state === $.signalR.connectionState.connected;
    }

    /**
     * Was there an error connecting to the server?
     */
    get errorConnecting() {
        return this._errorConnecting;
    }

    private initConnection(url: string) {
        // Initialize signalr data structures
        this.hubProxies = {};
        this._connection = $.hubConnection(url, { useDefaultPath: false });
        this._connection.logging = false;

        // We have to create the hub proxies and subscribe to events before connecting
        for (var properties of allHubProperties) {
            this.hubProxies[properties.hubName] = this.createHubProxy(properties);
        }
        for (var deferredRegistration of this.deferredRegistrations) {
            this.register(deferredRegistration);
        }
        this._connection.disconnected(this.disconnectedCallback);
        this._connection.reconnected(this.reconnectedCallback);
        this._connection.reconnecting(this.recconectingCallback);
        this._connection.stateChanged(function (change: any) {
            this.signalRState = change.newState;
        });
    }

    /**
     * Connects to the signalr server. Hubs are registered with the connection through
     * the @Hub decorator
     * @param url  URL of the signalr server
     * @param attemptReconnects Should the service try to reconnect if it loses connection
     */
    public connect(url: string = '/signalr', attemptReconnects: boolean = false): Observable<boolean> {
        this.attemptReconnects = attemptReconnects;
        return this._connect(url, false);
    }

    private _connect(url: string, ignoreReconnecting: boolean) {
        // If user calls connect while we're trying to reconnect, just give them that observable
        if (!ignoreReconnecting && this.reconnectingObservable != null) {
            return this.reconnectingObservable.asObservable();
        }
        if (this._connection === null) {
            this.initConnection(url);
        }
        // this._connection.start just returns the connection object, so map it to this.connected when it completes
        return Observable.fromPromise<boolean>(this._connection.start())
            .map((value: any) => this.connected)
            .do(this.connectedCallback)
            .catch(this.connectionErrorCallback);
    }

    /**
     * Disconnects from the signalr server, and pushes out the disconnected event
     */
    public disconnect(): Observable<boolean> {
        // connection.stop just returns the connection object, so map it to this.connected when it completes
        return Observable.fromPromise<boolean>(this._connection.stop()).map((value: any) => this.connected);
    }

    /**
     * Subscribe to the reconnected event
     * @param generatorOrNext callback for when we get reconnected to signalr
     */
    public onConnected(generatorOrNext: any) {
        return this.connectedEmitter.subscribe(generatorOrNext);
    }

    // This gets called from within the signalr instance so we have to make it a scoped method on the hubservice 
    private connectedCallback = () => {
        this._errorConnecting = !this.connected;
        this.connectedEmitter.emit(this.connected);
    }

    // This gets called from within the signalr instance so we have to make it a scoped method on the hubservice 
    private connectionErrorCallback = (err: any, caught: Observable<any>): Observable<boolean> => {
        this._errorConnecting = true;
        this.disconnectedEmitter.emit(this.connected);
        return Observable.of(false);
    }

    /**
     * Subscribe to the reconnected event
     * @param generatorOrNext callback for when we get reconnected to signalr
     */
    public onReconnected(generatorOrNext: any) {
        return this.reconnectedEmitter.subscribe(generatorOrNext);
    }

    // This gets called from within the signalr instance so we have to make it a scoped method on the hubservice 
    private reconnectedCallback = () => {
        this.reconnectedEmitter.emit(this.connected);
        this.connectedEmitter.emit(this.connected);
        this.reconnectingObservable.next(this.connected);
        this.reconnectingObservable = null;
    }

    /**
     * Subscribe to the reconnecting event
     * @param generatorOrNext callback for when we get the reconnecting event from signalr
     */
    public onReconnecting(generatorOrNext: any) {
        return this.reconnectingEmitter.subscribe(generatorOrNext);
    }

    // This gets called from within the signalr instance so we have to make it a scoped method on the hubservice 
    private recconectingCallback = () => {
        this.reconnectingEmitter.emit();
        this.reconnectingObservable = new Subject<boolean>();
    }

    /**
     * Subscribe to the disconnected event
     * @param generatorOrNext callback for when we get disconnected from signalr
     */
    public onDisconnected(generatorOrNext: any) {
        return this.disconnectedEmitter.subscribe(generatorOrNext);
    }

    // This gets called from within the signalr instance so we have to make it a scoped method on the hubservice 
    private disconnectedCallback = () => {
        if (this.tryingReconnect) {
            return;
        }
        this.disconnectedEmitter.emit(this.connected);
        if (this.attemptReconnects) {
            this.tryReconnect();
        }
    }

    /**
     * Attemps to reconnect
     */
    private tryReconnect() {
        this.tryingReconnect = true;
        this.reconnectingObservable = new Subject<boolean>();
        //try to reconnect forever.
        this._connect(this._connection.url, this.attemptReconnects).subscribe(async (connected: boolean) => {
            if (!connected) {
                await HubService.delay(1000);
                this.tryReconnect();
            } else {
                this.reconnectedCallback();
                this.tryingReconnect = false;
            }
        });
    }

    private static delay(ms: number): Promise<{}> {
        return new Promise(resolve => {
            setTimeout(() => resolve(), ms);
        });
    }

    /**
     * Calls the method on the server with the provided arguments.
     * If the hub connection is disconnected, the message will queue up and send when it reconnects.
     * @param hubName The hub name
     * @param method The method name
     * @param args The arguments to send to the hub
     */
    public invoke<T>(hubName: string, method: string, ...args: any[]): Observable<T> {
        let hubContainer = this.hubProxies[hubName];
        if (this.reconnectingObservable != null) {
            // We're reconnecting, so wait on that, then invoke our method
            return this.reconnectingObservable.flatMap((connected: boolean) => {
                if (!connected) {
                    return Observable.throw("SignalR disconnected");
                } else {
                    return Observable.fromPromise<T>(hubContainer.hubProxy.invoke(method, ...args));
                }
            });
        } else {
            // We're not reconnecting, so try to invoke our method
            return Observable.fromPromise<T>(hubContainer.hubProxy.invoke(method, ...args))
                .catch((err: any) => {
                    // We lost connection in the middle of the call? wait for reconnecting and send again then.
                    if (this.reconnectingObservable != null) {
                        return this.invoke(hubName, method, args);
                    } else {
                        // Let the caller handle it.
                        return Observable.throw(err);
                    }
                });
        }
    }

    /**
     * Register this class instance to the hubs. The class instance must have the @Hub decorator.
     * Any subscriptions defined in the @Hub decorator must have a matching method on the class to be called,
     * or have the @HubDecorator decorator on their event methods
     * @param instance The class to register with the hub service
     */
    public register(instance: any): HubWrapper {
        let hubProperties = <HubProperties>Reflect.getMetadata("Hub", instance);
        if (!hubProperties) {
            throw new Error("You must call register with an instance of a class with the @Hub decorator on it. Instance: " + instance);
        }

        let hubWrapper = {
            invoke: <T>(method: string, ...args: any[]) => this.invoke<T>(hubProperties.hubName, method, ...args)
        };

        if (hubProperties.subscriptions.length == 0) {
            // Signalr ignores hubs with no events(I assume you'd just want to use a POST then). Worth erroring out here.
            throw new Error(`Hub ${hubProperties.hubName} must have at least one event subscription.`);
        }

        // Allows the caller to register to hubs before actually connecting.
        if (this.hubProxies === void 0) {
            this.deferredRegistrations.push(instance);
            //doesn't matter if were not registered yet we can still return this object because the user shouldn't use it until they call connect()
            return hubWrapper;
        }

        for (let subscription of hubProperties.subscriptions) {
            // If the method for this subscription isn't defined skip it
            if (!(subscription.functionName in instance)) {
                console.warn(`${instance} is subscribing to event ${subscription} but has no matching method. Skipping subscription.`);
                continue;
            }
            // Adds a ref to the method on the instance to the list of events for this hub+event pairing
            this.hubProxies[hubProperties.hubName].events[subscription.eventName].push({
                thisObj: instance,
                callback: instance[subscription.functionName]
            });
        }

        return hubWrapper;
    }

    /**
     * Pushes out a message received by the hub to the subscribers registered through register
     * @param hub The hub name
     * @param subscription The subscription name(event name)
     * @param args The arguments from the hub
     */
    private hubMessageReceived(hub: string, subscription: { eventName: string, functionName: string }, args: IArguments) {
        if (!(hub in this.hubProxies)) {
            return;
        }
        let events = this.hubProxies[hub].events[subscription.eventName];
        for (let func of events) {
            // Wrap all the callbacks in a try/catch so they don't break other callbacks if one fails.
            try {
                func.callback.apply(func.thisObj, args);
            } catch (err) {
                console.error(`Hub callback error on hub ${hub} subscription ${subscription.eventName}. Error: ${err}`);
            }
        }
    }

    /**
     * Creates a hub proxy and registers the subscriptions on it
     * @param properties the properties for the hub
     */
    private createHubProxy(properties: HubProperties) {
        let hubProxy = this._connection.createHubProxy(properties.hubName);
        let events: eventsType = {};
        let _this_ = this;
        for (let subscription of properties.subscriptions) {
            // Don't resubscribe to events.
            if (subscription.eventName in events) {
                continue;
            }
            events[subscription.eventName] = [];
            // This method actually subscribes to the hub function.
            // We only subscribe once then push out the message to all subscribers
            hubProxy.on(subscription.eventName, function () {
                // We lose the "this" context with the jquery promise, so we have to store it as _this_.
                _this_.hubMessageReceived(properties.hubName, subscription, arguments);
            });
        }
        return {
            hubProxy: hubProxy,
            events: events
        };
    }
}