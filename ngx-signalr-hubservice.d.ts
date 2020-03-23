import { Observable, Subscription } from "rxjs";
/** Properties for the hub you're connecting to. hubName is required */
export declare type HubProperties = {
    /**
     * The name of the hub on the server to subscribe to.
     */
    hubName: string;
    /**
     * What "Group" this Hub belongs to.
     * If you're connecting to multiple SignalR servers you can use this to define what server(s) this hub is on.
     */
    hubGroups?: string | string[];
    /**
     * The events on this hub to subscribe to. You can ignore this if you use the @HubSubscription decorator on your methods
     */
    subscriptions?: Array<{
        eventName: string;
        functionName: string;
    }>;
};
/**
 * Adds the hubName property to the list of hubs to subscribe to
 * We have to define hubs and subscriptions before connecting so we only need one connection for all our hubs.
 * If your service is referenced in an external module, you have to reference it somewhere in your main/core code.
 * @param hubProperties the properties for this class's subscription to the hub
 */
export declare function Hub(hubProperties: HubProperties): Function;
/**
 * Subscribes to a hub event
 * @param the event to subscribe to. if null, it uses the method name
 */
export declare function HubSubscription(eventName?: string): Function;
/** A wrapper around the hub registration that lets us invoke methods on the hub and keep our "this" reference on responses */
export declare type HubWrapper = {
    invoke: <T>(method: string, ...args: any[]) => Observable<T>;
    unregister: () => void;
    hub: any;
};
export declare type HubServiceOptions = {
    /** Defaults to "/signalr" of the current domain */
    url?: string;
    /** Should the service try to silently reconnect if you lose connection */
    attemptReconnects?: boolean;
    /** The query string */
    qs?: string;
    /** The hub groups this connection should se */
    hubGroups?: string | string[];
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
    /** jQuery connection. */
    private _connection;
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
    /** currently trying to reconnect? */
    private tryingReconnect;
    /** the current state of the signalR connection */
    private reconnectingObservable;
    /** list of services to register after connect is called */
    private deferredRegistrations;
    private options;
    /**
     * The list of hubs keyed by name. Each entry has the jQuery hubproxy instance, and a list of
     * callbacks that we're going to push out events to
     */
    private hubProxies;
    readonly connection: any;
    /**
     * Is the client connected?
     */
    readonly connected: boolean;
    /**
     * Was there an error connecting to the server?
     */
    readonly errorConnecting: boolean;
    /**
     * Connects to the signalr server. Hubs are registered with the connection through
     * the @Hub decorator
     * @param options Options to use for the connection
     */
    connect(options?: HubServiceOptions): Observable<boolean>;
    private _connect;
    private initConnection;
    private matchesGroup;
    /**
     * Disconnects from the signalr server, and pushes out the disconnected event
     */
    disconnect(): Observable<boolean>;
    /**
     * Subscribe to the reconnected event
     * @param generatorOrNext callback for when we get reconnected to signalr
     */
    onConnected(generatorOrNext: any): Subscription;
    private connectedCallback;
    private connectionErrorCallback;
    /**
     * Subscribe to the reconnected event
     * @param generatorOrNext callback for when we get reconnected to signalr
     */
    onReconnected(generatorOrNext: any): Subscription;
    private reconnectedCallback;
    /**
     * Subscribe to the reconnecting event
     * @param generatorOrNext callback for when we get the reconnecting event from signalr
     */
    onReconnecting(generatorOrNext: any): Subscription;
    private reconnectingCallback;
    /**
     * Subscribe to the disconnected event
     * @param generatorOrNext callback for when we get disconnected from signalr
     */
    onDisconnected(generatorOrNext: any): Subscription;
    private disconnectedCallback;
    /**
     * Attemps to reconnect
     */
    private tryReconnect;
    private static delay;
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
     * Unregisters the instance from events.
     * @param instance the class instance to unregister
     */
    unregister(instance: any): void;
    /**
     * Pushes out a message received by the hub to the subscribers registered through register
     * @param hub The hub name
     * @param subscription The subscription name(event name)
     * @param args The arguments from the hub
     */
    private hubMessageReceived;
    /**
     * Creates a hub proxy and registers the subscriptions on it
     * @param properties the properties for the hub
     */
    private createHubProxy;
}
