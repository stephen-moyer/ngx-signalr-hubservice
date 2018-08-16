import { Component, Injectable, EventEmitter, NgZone } from "@angular/core";
import { Observable, Subject, from, of, throwError } from "rxjs";

import { map, tap, catchError, flatMap } from "rxjs/operators";

declare var $: any;
declare var Reflect: any;

/**
 * All the hubs/events we have to subscribe to when setting up the connection.
 * signalr requires you to connect to all the hubs before making the connection
 * so we store them in a global var.
 */
const allHubProperties: HubProperties[] = [];

/** Properties for the hub you're connecting to. hubName is required */
export type HubProperties = {

    /**
     * The name of the hub on the server to subscribe to.
     */
    hubName: string,

    /**
     * What "Group" this Hub belongs to.
     * If you're connecting to multiple SignalR servers you can use this to define what server(s) this hub is on.
     */
    hubGroups?: string | string[],

    /**
     * The events on this hub to subscribe to. You can ignore this if you use the @HubSubscription decorator on your methods
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
function getOrCreateHubProperties(target: any, hubProperties: HubProperties): HubProperties {
    let properties: HubProperties = <HubProperties>Reflect.getMetadata("Hub", target);
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
    if (!properties.hubGroups) {
        properties.hubGroups = hubProperties.hubGroups;
    }
    return properties;
}

/**
 * Adds the hubName property to the list of hubs to subscribe to
 * We have to define hubs and subscriptions before connecting so we only need one connection for all our hubs.
 * If your service is referenced in an external module, you have to reference it somewhere in your main/core code.
 * @param hubProperties the properties for this class's subscription to the hub
 */
export function Hub(hubProperties: HubProperties): Function {
    return function (target: Function): void {
        hubProperties = getOrCreateHubProperties(target.prototype, hubProperties);
        let existing: HubProperties = allHubProperties.find(props => props.hubName === hubProperties.hubName);
        if (existing) {
            existing.subscriptions.push(...hubProperties.subscriptions);
            return;
        }
        allHubProperties.push(hubProperties);
    };
}

/**
 * Subscribes to a hub event
 * @param the event to subscribe to. if null, it uses the method name
 */
export function HubSubscription(eventName?: string): Function {
    return function (target: Object, // the prototype of the class
        propertyKey: string, // the name of the method
        descriptor: TypedPropertyDescriptor<any>): void {
        eventName = eventName || propertyKey;
        let hubProperties: HubProperties = getOrCreateHubProperties(target, { hubName: null });
        hubProperties.subscriptions.push({
            eventName: eventName,
            functionName: propertyKey
        });
    };
}

/** A wrapper around the hub registration that lets us invoke methods on the hub and keep our "this" reference on responses */
export type HubWrapper = {
    /* calls the method on the hub with the provided arguments */
    invoke: <T>(method: string, ...args: any[]) => Observable<T>,
    unregister: () => void,
    hub: any
};

export type HubServiceOptions = {
    /** Defaults to "/signalr" of the current domain */
    url?: string,
    /** Should the service try to silently reconnect if you lose connection */
    attemptReconnects?: boolean;
    /** The query string */
    qs?: string;
    /** The hub groups this connection should se */
    hubGroups?: string | string[];
};

// some helper types. not exposed outside of this class.
type eventType = { thisObj: any, callback: Function };
type eventsType = { [key: string]: eventType[] };
type hubProxyWrapper = {
    hubProxy: any,
    events: eventsType
};

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

    private options: HubServiceOptions;

    /**
     * The list of hubs keyed by name. Each entry has the jQuery hubproxy instance, and a list of
     * callbacks that we're going to push out events to
     */
    private hubProxies: {
        [key: string]: hubProxyWrapper;
    };

    get connection(): any {
        return this._connection;
    }

    /**
     * Is the client connected?
     */
    get connected(): boolean {
        return this._connection !== null && this._connection.state === $.signalR.connectionState.connected;
    }

    /**
     * Was there an error connecting to the server?
     */
    get errorConnecting(): boolean {
        return this._errorConnecting;
    }

    /**
     * Connects to the signalr server. Hubs are registered with the connection through
     * the @Hub decorator
     * @param options Options to use for the connection
     */
    public connect(options: HubServiceOptions = {}): Observable<boolean> {
        this.options = {
            url: "/signalr",
            attemptReconnects: false,
            ...options
        };
        return this._connect(false);
    }

    private _connect(ignoreReconnecting: boolean): Observable<boolean> {
        // if user calls connect while we're trying to reconnect, just give them that observable
        if (!ignoreReconnecting && this.reconnectingObservable != null) {
            return this.reconnectingObservable.asObservable();
        }
        if (this._connection === null) {
            this.initConnection();
        }
        // this._connection.start just returns the connection object, so map it to this.connected when it completes
        return from<boolean>(this._connection.start()).pipe(
            map((value: any) => this.connected),
            tap(this.connectedCallback),
            catchError(this.connectionErrorCallback)
        );
    }

    private initConnection(): void {
        // initialize signalr data structures
        this.hubProxies = {};
        this._connection = $.hubConnection(this.options.url, { useDefaultPath: false });
        this._connection.qs = this.options.qs;
        this._connection.logging = false;

        // we have to create the hub proxies and subscribe to events before connecting
        for (var properties of allHubProperties) {
            // make sure we match this group
            if (!this.matchesGroup(properties.hubGroups)) {
                continue;
            }
            // we do, so create the proxy.
            this.hubProxies[properties.hubName] = this.createHubProxy(properties);
        }

        for (var deferredRegistration of this.deferredRegistrations) {
            this.register(deferredRegistration);
        }

        this._connection.disconnected(this.disconnectedCallback);
        this._connection.reconnected(this.reconnectedCallback);
        this._connection.reconnecting(this.recconectingCallback);
        this._connection.stateChanged(function (change: any): void {
            this.signalRState = change.newState;
        });
    }

    private matchesGroup(hubGroups: string | string[]): boolean {
        // if one is null and the other isn't assume we don't match.
        if (this.options.hubGroups == null && hubGroups != null) {
            return false;
        }
        if (hubGroups == null && this.options.hubGroups != null) {
            return false;
        }
        // if both null then assume match.
        if (hubGroups == null && this.options.hubGroups == null) {
            return true;
        }

        // just force arrays here to simplify the logic.
        if (!Array.isArray(hubGroups)) {
            hubGroups = [ hubGroups ];
        }
        if (!Array.isArray(this.options.hubGroups)) {
            this.options.hubGroups = [ this.options.hubGroups ];
        }

        // check for at least one match.
        var ourGroups: string[] = <string[]> this.options.hubGroups;
        return hubGroups.some(group => ourGroups.some(ourGroup => group === ourGroup));
    }

    /**
     * Disconnects from the signalr server, and pushes out the disconnected event
     */
    public disconnect(): Observable<boolean> {
        // connection.stop just returns the connection object, so map it to this.connected when it completes
        return from<boolean>(this._connection.stop()).pipe(map((value: any) => this.connected));
    }

    /**
     * Subscribe to the reconnected event
     * @param generatorOrNext callback for when we get reconnected to signalr
     */
    public onConnected(generatorOrNext: any): boolean {
        return this.connectedEmitter.subscribe(generatorOrNext);
    }

    // this gets called from within the signalr instance so we have to make it a scoped method on the hubservice
    private connectedCallback = () => {
        this._errorConnecting = !this.connected;
        this.connectedEmitter.emit(this.connected);
    }

    // this gets called from within the signalr instance so we have to make it a scoped method on the hubservice
    private connectionErrorCallback = (err: any, caught: Observable<any>): Observable<boolean> => {
        this._errorConnecting = true;
        this.disconnectedEmitter.emit(this.connected);
        return of(false);
    }

    /**
     * Subscribe to the reconnected event
     * @param generatorOrNext callback for when we get reconnected to signalr
     */
    public onReconnected(generatorOrNext: any): any {
        return this.reconnectedEmitter.subscribe(generatorOrNext);
    }

    // this gets called from within the signalr instance so we have to make it a scoped method on the hubservice
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
    public onReconnecting(generatorOrNext: any): any {
        return this.reconnectingEmitter.subscribe(generatorOrNext);
    }

    // this gets called from within the signalr instance so we have to make it a scoped method on the hubservice
    private recconectingCallback = () => {
        this.reconnectingEmitter.emit();
        this.reconnectingObservable = new Subject<boolean>();
    }

    /**
     * Subscribe to the disconnected event
     * @param generatorOrNext callback for when we get disconnected from signalr
     */
    public onDisconnected(generatorOrNext: any): any {
        return this.disconnectedEmitter.subscribe(generatorOrNext);
    }

    // this gets called from within the signalr instance so we have to make it a scoped method on the hubservice
    private disconnectedCallback = () => {
        if (this.tryingReconnect) {
            return;
        }
        this.disconnectedEmitter.emit(this.connected);
        if (this.options.attemptReconnects) {
            this.tryReconnect();
        }
    }

    /**
     * Attemps to reconnect
     */
    private tryReconnect(): void {
        this.tryingReconnect = true;
        this.reconnectingObservable = new Subject<boolean>();
        // try to reconnect forever.
        this._connect(this.options.attemptReconnects).subscribe(async (connected: boolean) => {
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
        let hubContainer: hubProxyWrapper = this.hubProxies[hubName];
        if (hubContainer == null) {
            throw new Error(`Invalid hub name ${hubName}`);
        }
        if (this.reconnectingObservable != null) {
            // we're reconnecting, so wait on that, then invoke our method
            return this.reconnectingObservable.pipe(flatMap((connected: boolean) => {
                if (!connected) {
                    return Observable.throw("SignalR disconnected");
                } else {
                    return from<T>(hubContainer.hubProxy.invoke(method, ...args));
                }
            }));
        } else {
            // we're not reconnecting, so try to invoke our method
            return from<T>(hubContainer.hubProxy.invoke(method, ...args)).pipe(
                catchError((err: any) => {
                    // we lost connection in the middle of the call? wait for reconnecting and send again then.
                    if (this.reconnectingObservable != null) {
                        return this.invoke<T>(hubName, method, args);
                    } else {
                        // let the caller handle it.
                        return throwError(err);
                    }
                })
            );
        }
    }

    /**
     * Register this class instance to the hubs. The class instance must have the @Hub decorator.
     * Any subscriptions defined in the @Hub decorator must have a matching method on the class to be called,
     * or have the @HubDecorator decorator on their event methods
     * @param instance The class to register with the hub service
     */
    public register(instance: any): HubWrapper {
        let hubProperties: HubProperties = <HubProperties>Reflect.getMetadata("Hub", instance);
        if (!hubProperties) {
            throw new Error("You must call register with an instance of a class with the @Hub decorator on it. Instance: " + instance);
        }

        let hubWrapper: HubWrapper = {
            invoke: <T>(method: string, ...args: any[]) => this.invoke<T>(hubProperties.hubName, method, ...args),
            hub: <any> null,
            unregister: () => this.unregister(instance)
        };

        if (hubProperties.subscriptions.length === 0) {
            // signalr ignores hubs with no events(I assume you'd just want to use a POST then). Worth erroring out here.
            throw new Error(`Hub ${hubProperties.hubName} must have at least one event subscription.`);
        }

        // allows the caller to register to hubs before actually connecting.
        if (this.hubProxies === void 0) {
            this.deferredRegistrations.push(instance);
            // doesn't matter if were not registered yet we can still return this object
            // because the user shouldn't use it until they call connect()
            return hubWrapper;
        }

        // get the hub proxy and set its hub instance if it's not set.
        let hubProxy: hubProxyWrapper = this.hubProxies[hubProperties.hubName];

        if (hubProxy == null) {
            // only throw the invalid hub error if it matches this connections group.
            if (!this.matchesGroup(hubProperties.hubGroups)) {
                return;
            }
            throw new Error(`Invalid hub name ${hubProperties.hubName}`);
        }
        if (hubWrapper.hub == null) {
            hubWrapper.hub = hubProxy.hubProxy;
        }

        // subscribe to all the events
        for (let subscription of hubProperties.subscriptions) {
            // if the method for this subscription isn't defined skip it
            if (!(subscription.functionName in instance)) {
                console.warn(`${instance} is subscribing to event ${subscription} but has no matching method. Skipping subscription.`);
                continue;
            }
            // adds a ref to the method on the instance to the list of events for this hub+event pairing
            hubProxy.events[subscription.eventName].push({
                thisObj: instance,
                callback: instance[subscription.functionName]
            });
        }

        return hubWrapper;
    }

    /**
     * Unregisters the instance from events.
     * @param instance the class instance to unregister
     */
    public unregister(instance: any): void {
        let hubProperties: HubProperties = <HubProperties>Reflect.getMetadata("Hub", instance);
        if (!hubProperties) {
            throw new Error("You must call unregister with an instance of a class with the @Hub decorator on it. Instance: " + instance);
        }

        let proxy: hubProxyWrapper = this.hubProxies[hubProperties.hubName];
        for (let subscription of hubProperties.subscriptions) {
            let events: eventType[] = proxy.events[subscription.eventName];
            if (events == null) {
                continue;
            }
            for (let i: number = events.length - 1; i >= 0; i--) {
                let event: eventType = events[i];
                if (event.thisObj !== instance) {
                    continue;
                }
                events.splice(i, 1);
            }
        }
    }

    /**
     * Pushes out a message received by the hub to the subscribers registered through register
     * @param hub The hub name
     * @param subscription The subscription name(event name)
     * @param args The arguments from the hub
     */
    private hubMessageReceived(hub: string, subscription: { eventName: string, functionName: string }, args: IArguments): void {
        if (!(hub in this.hubProxies)) {
            return;
        }
        let events: eventType[] = this.hubProxies[hub].events[subscription.eventName];
        for (let func of events) {
            // wrap all the callbacks in a try/catch so they don't break other callbacks if one fails.
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
    private createHubProxy(properties: HubProperties): hubProxyWrapper {
        let hubProxy: any = this._connection.createHubProxy(properties.hubName);
        let events: eventsType = {};
        let _this_: HubService = this;
        for (let subscription of properties.subscriptions) {
            // don't resubscribe to events.
            if (subscription.eventName in events) {
                continue;
            }
            events[subscription.eventName] = [];
            // this method actually subscribes to the hub function.
            // we only subscribe once then push out the message to all subscribers
            hubProxy.on(subscription.eventName, function (): void {
                // we lose the "this" context with the jquery promise, so we have to store it as _this_.
                _this_.hubMessageReceived(properties.hubName, subscription, arguments);
            });
        }
        return {
            hubProxy: hubProxy,
            events: events
        };
    }
}