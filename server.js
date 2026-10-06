import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();

app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 10000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function createMcpServer() {
  const server = new McpServer({
    name: "Gemini Image Generator",
    version: "1.0.0"
  });

  server.registerTool(
    "generate_image",
    {
      title: "Generate Gemini Image",
      description:
        "Generate an image using Google Gemini 3.1 Flash Image (Nano Banana).",
      inputSchema: {
        prompt: z.string().describe("Detailed description of the image to generate"),
        aspect_ratio: z
          .enum([
            "1:1",
            "2:3",
            "3:2",
            "3:4",
            "4:3",
            "4:5",
            "5:4",
            "9:16",
            "16:9",
            "21:9"
          ])
          .optional()
          .default("1:1"),
        image_size: z
          .enum(["1K", "2K", "4K"])
          .optional()
          .default("1K")
      }
    },

    async ({ prompt, aspect_ratio, image_size }) => {
      if (!GEMINI_API_KEY) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "GEMINI_API_KEY is missing in Render Environment Variables."
            }
          ]
        };
      }

      try {
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/interactions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": GEMINI_API_KEY
            },
            body: JSON.stringify({
              model: "gemini-3.1-flash-image",
              input: prompt,
              response_format: {
                type: "image",
                aspect_ratio: aspect_ratio,
                image_size: image_size
              }
            })
          }
        );

        const data = await response.json();

        if (!response.ok) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "Gemini API error: " + JSON.stringify(data)
              }
            ]
          };
        }

        if (!data.output_image || !data.output_image.data) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text:
                  "Gemini did not return an image. Response: " +
                  JSON.stringify(data)
              }
            ]
          };
        }

        return {
          content: [
            {
              type: "image",
              data: data.output_image.data,
              mimeType: data.output_image.mime_type || "image/png"
            }
          ]
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Server error: " + error.message
            }
          ]
        };
      }
    }
  );

  return server;
}

app.get("/", (req, res) => {
  res.send("Gemini Image MCP is running.");
});

app.all("/mcp", async (req, res) => {
  const server = createMcpServer();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error"
        },
        id: null
      });
    }
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Gemini Image MCP running on port ${PORT}`);
});
