using Owin;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;

namespace NgxSignalRExample
{
    public class Startup
    {
        public void Configuration(IAppBuilder app)
        {
            app.UseCors(Microsoft.Owin.Cors.CorsOptions.AllowAll);
            app.MapSignalR();
        }
    }
}