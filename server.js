import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 10000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function createServer() {
  const server = new McpServer({
    name: "Gemini Image Generator",
    version: "1.0.0"
  });

  server.registerTool(
    "generate_image",
    {
      description: "Generate an image using Google Gemini image generation.",
      inputSchema: {
        prompt: z.string().describe("Detailed image prompt"),
        aspect_ratio: z
          .enum([
            "1:1", "2:3", "3:2", "3:4", "4:3",
            "4:5", "5:4", "9:16", "16:9", "21:9"
          ])
          .default("1:1"),
        image_size: z
          .enum(["1K", "2K", "4K"])
          .default("1K")
      }
    },
    async ({ prompt, aspect_ratio, image_size }) => {
      if (!GEMINI_API_KEY) {
        return {
          isError: true,
          content: [{ type: "text", text: "GEMINI_API_KEY is not configured." }]
        };
      }

      try {
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": GEMINI_API_KEY
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text: prompt }]
                }
              ],
              generationConfig: {
                responseModalities: ["IMAGE"],
                responseFormat: {
                  image: {
                    aspectRatio: aspect_ratio,
                    imageSize: image_size
                  }
                }
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
                text: `Gemini API error: ${JSON.stringify(data)}`
              }
            ]
          };
        }

        const parts = data?.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find((p) => p.inlineData?.data);

        if (!imagePart) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "Gemini did not return an image."
              }
            ]
          };
        }

        return {
          content: [
            {
              type: "image",
              data: imagePart.inlineData.data,
              mimeType: imagePart.inlineData.mimeType || "image/png"
            }
          ]
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Server error: ${error.message}`
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

app.post("/mcp", async (req, res) => {
  const server = createServer();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Gemini Image MCP running on port ${PORT}`);
});
