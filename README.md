# ngx-signalr-hubservice
Makes using signalr hubs easy

# Getting started

1. Set up a new project using [@angular/cli](https://cli.angular.io/)

1. Install ngx-signalr-hubservice
`npm install --save ngx-signalr-hubservice`

1. Import the HubService and add it to your providers in your `app.module.ts`. Mine looks like this(I've included FormsModule for the demo):
    ```
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

    ```
    constructor(private hubService: HubService) {
    }
    ...
    ...
    async ngOnInit() {
        //connects to the signalr server.
        this.connected = await this.hubService.connect(url).toPromise();
    }
    ```

1. Define a class that will interact with the signalr server. For me it's just the root `AppComponent`.
   You can use the `@Hub` decorator on the class to define what hub this class connects to.
    ```
    import { Component, OnInit } from '@angular/core';
    import { 
    HubService, 
    Hub, 
    HubSubscription, 
    HubWrapper 
    } from 'ngx-signalr-hubservice';

    import 'rxjs/add/operator/toPromise';

    const url = 'http://localhost:64339/signalr';

    @Component({
    selector: 'app-root',
    templateUrl: './app.component.html'
    })
    @Hub({ hubName: 'chatHub' }) //<-- Your hub declaration
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
1. Define a method that the hub will call with @HubSubscription in the same class. You can pass in the method name in the decorator, or just leave it blank. If left blank, the service will use the name of the method that you added to decorator to as the subscription name. NOTE: you generally have to run these callbacks inside angular's zone if you're updating UI. Hopefully future versions you won't have to do this.
    ```
    @HubSubscription()
    receiveMessage(param1: any, param2: any) {
        console.log(param1, param2);
    }
    ```
1. For calling methods on the hub, you need to register this class with the hub service. Note, you HAVE to do this before calling connect. If you do it after your hubs won't be registered.

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

And thats it!