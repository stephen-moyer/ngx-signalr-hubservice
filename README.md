# ngx-signalr-hubservice
Makes using SignalR in Angular 2/4 easy.

# Getting started

1. Set up a new project using [@angular/cli](https://cli.angular.io/)

1. Install ngx-signalr-hubservice
`npm install --save ngx-signalr-hubservice`

1. Add the jquery and SignalR scripts to your angular-cli.json
    ```typescript
    "scripts": [ "../node_modules/jquery/dist/jquery.min.js", "../node_modules/signalr/jquery.signalr.js"]
    ```
1. Import the HubService and add it to your providers in your `app.module.ts`. Mine looks like this(I've included FormsModule for the demo):
    ```typescript
    import { BrowserModule } from '@angular/platform-browser';
    import { NgModule } from '@angular/core';
    import { FormsModule } from '@angular/forms';

    import { AppComponent } from './app.component';

    import { HubService } from 'ngx-signalr-hubservice';

    @NgModule({
    declarations: [
        AppComponent
    ],
    imports: [
        BrowserModule,
        FormsModule
    ],
    providers: [ HubService ],
    bootstrap: [AppComponent]
    })
    export class AppModule { }
    ```
1. Inject the hub service in (probably) your root component. In this case it's `app.component.ts`. Make sure you import the service. Here you can make the connection.

    ```typescript
    constructor(private hubService: HubService) {
    }
    ...
    ...
    async ngOnInit() {
        // connects to the SignalR server.
		// passing in null for options will just use /signalr on the current domain as the url
        this.connected = await this.hubService.connect().toPromise();
    }
    ```
   For my applications I generally just reference the HubService in my other services(one service for each hub), and expose the hub methods/events through those services. For a demo this works too though.

1. Define a class that will interact with the SignalR server. For me it's just the root `AppComponent`.
   You can use the `@Hub` decorator on the class to define what hub this class connects to.
    ```typescript
    import { Component, OnInit } from '@angular/core';
    import { 
    HubService, 
    Hub, 
    HubSubscription, 
    HubWrapper 
    } from 'ngx-SignalR-hubservice';

    import 'rxjs/add/operator/toPromise';

    @Component({
    selector: 'app-root',
    templateUrl: './app.component.html'
    })
    @Hub({ hubName: 'chatHub' }) // <-- Your hub declaration
    export class AppComponent implements OnInit {

        private hubWrapper: HubWrapper;

        connected = false;

        constructor(private hubService: HubService) {
            this.hubWrapper = hubService.register(this);
        }

        async ngOnInit() {
            this.connected = await this.hubService.connect().toPromise();
        }

    }
    ```
1. Define a method that the hub will call with @HubSubscription in the same class. You can pass in the method name in the decorator, or just leave it blank. If left blank, the service will use the name of the method that you added the decorator to as the subscription name. NOTE: you generally have to run these callbacks inside angular's zone if you're updating UI. Hopefully future versions you won't have to do this.
    ```typescript
    @HubSubscription()
    receiveMessage(param1: any, param2: any) {
        console.log(param1, param2);
    }
    ```
1. For calling methods on the hub, you need to register this class with the hub service.

    Update your constructor to this, and add a new field on your class:
    ```typescript
    private hubWrapper: HubWrapper;
    constructor(private hubService: HubService) {
        this.hubWrapper = hubService.register(this);
    }
    ```
   Now you can call methods on the hub using this hub wrapper,
    ```typescript
    callHubMethod() {
        var result = await this.hubWrapper.invoke<boolean>('methodName', 'someParam').toPromise();
        console.log(result);
    }
    ```
1. You can unregister hub wrappers from the service with `hubWrapper.unregister()` or `hubService.unregister(this);`. Generally you wouldn't want to do this because you'll call SignalR from services that exist during the lifetime of your application.
    ```typescript
    ngOnDestroy() {
        this.hubWrapper.unregister();
        //or this.hubService.unregister(this);
    }
    ```

# Hub Groups
You can use the `hubGroups` parameter on the `@Hub` decorator if you have two or more SignalR connections being made and want to control which `@Hub` decorators are applying to which connection.

You can see an example of this here:
```typescript
@Injectable()
@Hub({ hubName: 'DataHub', hubGroup: 'group1' })
export class DataHubService {

    constructor (@Inject(HUB_SERVICE_GROUP1) private hubService: HubService) {
        this.hubWrapper = this.hubService.register(this);
        this.hubService.connect('http://localhost:81/signalr', { hubGroup: 'group1' }).toPromise();
    }

}

@Injectable()
@Hub({ hubName: 'EvaluationHub', hubGroup: 'group2' })
export class EvaluationHubService {

    constructor (@Inject(HUB_SERVICE_GROUP2) private hubService: HubService) {
        this.hubWrapper = this.hubService.register(this);
        this.hubService.connect('http://localhost:82/signalr', { hubGroup: 'group2' }).toPromise();
    }

}
```

Note the `@Inject` decorator on the constructors of the services. You need to specify which connection you want to inject into your service if you're using multiple HubServices. Remember to provide your HubService's correctly too with the proper `InjectionToken`

```typescript

// Probably at the top of your NgModule
export let HUB_SERVICE_GROUP1 = new InjectionToken<HubService>("hubservice.group1");
export let HUB_SERVICE_GROUP2 = new InjectionToken<HubService>("hubservice.group2");

...

// In your NgModule decorator
providers: [
    { provide: HUB_SERVICE_GROUP1, useValue: new HubService() }
    { provide: HUB_SERVICE_GROUP2, useValue: new HubService() }
]
```

# Notes

- If you want to get the underlying SignalR instances, you can access them through `HubService.connection` for the SignalR connection instance(`$.connection`). You can access the SignalR hub instances for the individual hubs through `HubWrapper.hub`.

- If you pass `attemptReconnects` as true to `HubService.connect` options parameter, any `invoke` calls on your HubWrappers will defer until the HubService reconnects. They will most likely not error.