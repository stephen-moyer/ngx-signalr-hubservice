import { NgZone, Component, OnInit } from "@angular/core";

import { HubService } from "ngx-signalr-hubservice";
import { ChatService, ChatMessage } from "./service/chat.service";

const url = "http://localhost:52043/signalr";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"]
})
export class AppComponent implements OnInit {

  connecting = false;
  connected = false;
  sending = false;
  enteredName = false;

  username: string;
  message: string;

  messages: ChatMessage[] = [];

  constructor(
    private hubService: HubService,
    private ngZone: NgZone,
    private chatService: ChatService) {
  }

  async ngOnInit() {
    this.connecting = true;
    this.connected = await this.hubService.connect({ url: url }).toPromise();
    this.connecting = false;
    this.chatService.onMessageReceived.subscribe((chatMessage: ChatMessage) => this.receiveMessage(chatMessage));
  }

  async sendMessage() {
    this.sending = true;
    const chatMessage = await this.chatService.sendMessage(this.username, this.message).toPromise();
    this.messages.push(chatMessage);
    this.message = "";
    this.sending = false;
  }

  receiveMessage(message: ChatMessage) {
    this.ngZone.run(() => {
      this.messages.push(message);
    });
  }

}
