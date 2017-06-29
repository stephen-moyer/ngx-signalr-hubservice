# Example chat application

Here's an example chat application. Make sure you add the HubService to your app module's providers.

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
  template: `
  <div style="text-align:center">
    <h1>
      Welcome to the chat
    </h1>
    <div *ngIf="!connected && !connecting">
      Error connecting to the chat!
    </div>
    <div *ngIf="connecting">
      Connecting to the chat
    </div>
    <div *ngIf="connected && !enteredName">
      Enter your name: <input [(ngModel)]="name" width="50" type="text"/> <button (click)="enteredName = true;">Enter</button>
    </div>
    <div *ngIf="connected && enteredName">
      <div style="margin-left: auto; margin-right: auto; width: 250px; height: 250px; text-align: left; overflow-y: auto;">
        <span *ngFor="let message of messages;">
          {{message.name}}: {{message.message}}
          <br/>
        </span>
      </div>
      <input [(ngModel)]="message" [disabled]="sending" width="50" type="text"/> <button [disabled]="sending" (click)="sendMessage()">Send</button>
    </div>
  </div>
  `,
  styleUrls: ['./app.component.css']
})
@Hub({ hubName: 'chatHub' })
export class AppComponent implements OnInit {

  private hubWrapper: HubWrapper;

  connecting = false;
  connected = false;
  sending = false;
  enteredName = false;

  name = '';
  message = '';
  
  messages = <[ { name: string, message: string } ]> []; 

  constructor(private hubService: HubService) {
    this.hubWrapper = hubService.register(this);
  }

  async ngOnInit() {
    this.connecting = true;
    this.connected = await this.hubService.connect(url).toPromise();
    this.connecting = false;
  }

  async sendMessage() {
    this.sending = true;
    await this.hubWrapper.invoke("sendMessage", this.name, this.message).toPromise();
    this.message = '';
    this.sending = false;
  }

  @HubSubscription()
  receiveMessage(name: string, message: string) {
    this.messages.push({ name: name, message: message });
  }

}
```
