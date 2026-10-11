import { eventSettingsSchemas } from "@32dashboards/source-sdk";
import { ConfigSchema } from "../config.js";

export const { configs, secretStatus } = eventSettingsSchemas(ConfigSchema);
