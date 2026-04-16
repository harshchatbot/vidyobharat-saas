import { fal } from "@fal-ai/client";

fal.config({
  credentials: process.env.FAL_KEY,
});

const requestId = "019d9034-236f-7472-b6c7-c4344f1007f8";

const status = await fal.queue.status("fal-ai/infinitalk/single-text", {
  requestId,
  logs: true,
});

console.log("STATUS:", JSON.stringify(status, null, 2));

const result = await fal.queue.result("fal-ai/infinitalk/single-text", {
  requestId,
});

console.log("RESULT:", JSON.stringify(result, null, 2));
console.log("VIDEO URL:", result?.data?.video?.url);