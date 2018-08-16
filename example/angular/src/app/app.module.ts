import { BrowserModule } from "@angular/platform-browser";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";

import { AppComponent } from "./app.component";

import { HubService } from "ngx-signalr-hubservice";
import { ChatService } from "./service/chat.service";

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    FormsModule
  ],
  providers: [
    HubService,
    ChatService
  ],
  bootstrap: [
    AppComponent
  ]
})
export class AppModule { }
