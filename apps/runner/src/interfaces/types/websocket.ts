import type { z } from "zod";
import type {
	webSocketEventSchema,
	webSocketEventTypeEnum,
} from "../schemas/websocket";

export type WebSocketEvent = z.infer<typeof webSocketEventSchema>;
export type WebSocketEventType = z.infer<typeof webSocketEventTypeEnum>;
