# ngx-SignalR-hubservice
Makes using SignalR in Angular 2/4 easy.

# Getting started

1. Set up a new project using [@angular/cli](https://cli.angular.io/)

1. Install ngx-SignalR-hubservice
`npm install --save ngx-SignalR-hubservice`

1. Add the jquery and SignalR scripts to your angular-cli.json
    ```
    "scripts": [ "../node_modules/jquery/dist/jquery.min.js", "../node_modules/SignalR/jquery.SignalR.js"]
    ```
1. Import the HubService and add it to your providers in your `app.module.ts`. Mine looks like this(I've included FormsModule for the demo):
    ```
    import { BrowserModule } from '@angular/platform-browser';
    import { NgModule } from '@angular/core';
    import { FormsModule } from '@angular/forms';

    import { AppComponent } from './app.component';

    import { HubService } from 'ngx-SignalR-hubservice';

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

    ```
    constructor(private hubService: HubService) {
    }
    ...
    ...
    async ngOnInit() {
        // connects to the SignalR server.
        this.connected = await this.hubService.connect(url).toPromise();
    }
    ```
   For my applications I generally just reference the HubService in my other services(one service for each hub), and expose the hub methods/events through those services. For a demo this works too though.

1. Define a class that will interact with the SignalR server. For me it's just the root `AppComponent`.
   You can use the `@Hub` decorator on the class to define what hub this class connects to.
    ```
    import { Component, OnInit } from '@angular/core';
    import { 
    HubService, 
    Hub, 
    HubSubscription, 
    HubWrapper 
    } from 'ngx-SignalR-hubservice';

    import 'rxjs/add/operator/toPromise';

    const url = 'http://localhost:64339/SignalR';

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
            this.connected = await this.hubService.connect(url).toPromise();
        }

    }
    ```
1. Define a method that the hub will call with @HubSubscription in the same class. You can pass in the method name in the decorator, or just leave it blank. If left blank, the service will use the name of the method that you added the decorator to as the subscription name. NOTE: you generally have to run these callbacks inside angular's zone if you're updating UI. Hopefully future versions you won't have to do this.
    ```
    @HubSubscription()
    receiveMessage(param1: any, param2: any) {
        console.log(param1, param2);
    }
    ```
1. For calling methods on the hub, you need to register this class with the hub service.

    Update your constructor to this, and add a new field on your class:
    ```
    private hubWrapper: HubWrapper;
    constructor(private hubService: HubService) {
        this.hubWrapper = hubService.register(this);
    }
    ```
   Now you can call methods on the hub using this hub wrapper,
    ```
    callHubMethod() {
        var result = await this.hubWrapper.invoke<boolean>('methodName', 'someParam').toPromise();
        console.log(result);
    }
    ```
1. You can unregister hub wrappers from the service with `hubWrapper.unregister()` or `hubService.unregister(this);`. Generally you wouldn't want to do this because you'll call SignalR from services that exist during the lifetime of your application.
    ```
    ngOnDestroy() {
        this.hubWrapper.unregister();
        //or this.hubService.unregister(this);
    }
    ```
