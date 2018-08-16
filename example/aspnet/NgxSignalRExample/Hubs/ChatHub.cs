using Microsoft.AspNet.SignalR;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Web;

namespace NgxSignalRExample.Hubs
{
    public class ChatHub : Hub
    {

        public void SendMessage(string username, string message)
        {
            Clients.AllExcept(Context.ConnectionId).messageReceived(username, message);
        }

    }
}