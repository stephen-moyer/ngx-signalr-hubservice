import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/of';
import 'rxjs/add/observable/fromPromise';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import 'rxjs/add/operator/do';
/** Properties for the hub you're connecting to. hubName is required */
export declare type HubProperties = {
    /**
     * The name of the hub on the server to subscribe to.
     */
    hubName: string;
    /**
     * The events on this hub to subscribe to
     */
    subscriptions?: string[];
};
/**
 * Adds the hubName property to the list of hubs to subscribe to
 * We have to define hubs and subscriptions before connecting so we only need one connection for all our hubs.
 * If your service is referenced in an external module, you have to reference it somewhere in your main/core code.
 * @param hubProperties the properties for this class's subscription to the hub
 */
export declare function Hub(hubProperties: HubProperties): (target: Function) => void;
/**
 * Subscribes to a hub event
 * @param the event to subscribe to. if null, it uses the method name
 */
export declare function HubSubscription(eventName?: string): (target: Object, propertyKey: string, descriptor: TypedPropertyDescriptor<any>) => void;
/** A wrapper around the hub registration that lets us invoke methods on the hub and keep our "this" reference on responses */
export declare type HubWrapper = {
    invoke: <T>(method: string, ...args: any[]) => Observable<T>;
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
export declare class HubService {
    /** jQuery connection. TODO look for signalr bindings */
    private connection;
    /** emitter for connected event */
    private connectedEmitter;
    /** emitter for disconnected event */
    private disconnectedEmitter;
    /** emitter for reconnecting event */
    private reconnectingEmitter;
    /** emitter for reconnected event */
    private reconnectedEmitter;
    /** if there was an error connecting */
    private _errorConnecting;
    /** current trying to reconnect? */
    private tryingReconnect;
    /** the current state of the signalR connection */
    private reconnectingObservable;
    /** list of services to register after connect is called */
    private deferredRegistrations;
    private attemptReconnects;
    /**
     * The list of hubs keyed by name. Each entry has the jQuery hubproxy instance, and a list of
     * callbacks that we're going to push out events to
     */
    private hubProxies;
    /**
     * Is the client connected?
     */
    readonly connected: boolean;
    /**
     * Was there an error connecting to the server?
     */
    readonly errorConnecting: boolean;
    private initConnection();
    /**
     * Connects to the signalr server. Hubs are registered with the connection through
     * the @Hub decorator
     */
    connect(attemptReconnects?: boolean): Observable<boolean>;
    private _connect(ignoreReconnecting);
    /**
     * Disconnects from the signalr server, and pushes out the disconnected event
     */
    disconnect(): Observable<boolean>;
    /**
     * Subscribe to the reconnected event
     * @param generatorOrNext callback for when we get reconnected to signalr
     */
    onConnected(generatorOrNext: any): any;
    private connectedCallback;
    private connectionErrorCallback;
    /**
     * Subscribe to the reconnected event
     * @param generatorOrNext callback for when we get reconnected to signalr
     */
    onReconnected(generatorOrNext: any): any;
    private reconnectedCallback;
    /**
     * Subscribe to the reconnecting event
     * @param generatorOrNext callback for when we get the reconnecting event from signalr
     */
    onReconnecting(generatorOrNext: any): any;
    private recconectingCallback;
    /**
     * Subscribe to the disconnected event
     * @param generatorOrNext callback for when we get disconnected from signalr
     */
    onDisconnected(generatorOrNext: any): any;
    private disconnectedCallback;
    private tryReconnect();
    private static delay(ms);
    /**
     * Calls the method on the server with the provided arguments.
     * If the hub connection is disconnected, the message will queue up and send when it reconnects.
     * @param hubName The hub name
     * @param method The method name
     * @param args The arguments to send to the hub
     */
    invoke<T>(hubName: string, method: string, ...args: any[]): Observable<T>;
    /**
     * Register this class instance to the hubs. The class instance must have the @Hub decorator.
     * Any subscriptions defined in the @Hub decorator must have a matching method on the class to be called,
     * or have the @HubDecorator decorator on their event methods
     * @param instance The class to register with the hub service
     */
    register(instance: any): HubWrapper;
    /**
     * Pushes out a message received by the hub to the subscribers registered through register
     * @param hub The hub name
     * @param subscription The subscription name(event name)
     * @param args The arguments from the hub
     */
    private hubMessageReceived(hub, subscription, args);
    /**
     * Creates a hub proxy and registers the subscriptions on it
     * @param properties the properties for the hub
     */
    private createHubProxy(properties);
}
