const WebSocket = require("ws");

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Set();

    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      console.log("New client connected");

      ws.on("message", (message) => {
        try {
          const data = JSON.parse(message);
          console.log("Received:", data);

          // BROADCAST THE MESSAGE TO ALL CONNECTED CLIENTS
          this.broadcast(data);
        } catch (error) {
          console.error("Invalid JSON received:", message);
        }
      });

      ws.on("close", () => {
        this.clients.delete(ws);
        console.log("Client disconnected");
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
      });
    });
  }

  broadcast(data) {
    const message = JSON.stringify(data);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

module.exports = WebSocketServer;