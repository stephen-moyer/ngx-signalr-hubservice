import { Injectable, EventEmitter } from "@angular/core";
import { Observable } from "rxjs";

import { map } from "rxjs/operators";

import {
  Hub,
  HubService,
  HubWrapper,
  HubSubscription
} from "ngx-signalr-hubservice";

export interface ChatMessage { username: string; message: string; }

@Injectable()
@Hub({ hubName: "chatHub" })
export class ChatService {

  private hubWrapper: HubWrapper;

  public onMessageReceived = new EventEmitter<ChatMessage>();

  constructor(private hubService: HubService) {
    this.hubWrapper = this.hubService.register(this);
  }

  public sendMessage(username: string, message: string): Observable<ChatMessage> {
    return this.hubWrapper.invoke<boolean>("sendMessage", username, message).pipe(map(_ => {
      return {
        username,
        message
      };
    }));
  }

  @HubSubscription()
  private messageReceived(username: string, message: string) {
    this.onMessageReceived.emit({
      username,
      message
    });
  }

}
