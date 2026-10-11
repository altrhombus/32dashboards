import type NodeCG from "nodecg/types";
import { z } from "zod";
import {
  getCore,
  listenForCommand,
  secretStoreFor,
  type FundraiserCoreApi,
  type SecretStore,
} from "@32dashboards/source-sdk";
import { PUSH_PATH, SOURCE_ID, type EndpointReplicant } from "../model.js";
import { handlePush, hashToken, newToken } from "./push.js";

const TOKEN_SCOPE = "install";

/**
 * Accepts results pushed over HTTP, so a process in any language can feed
 * the core:
 *
 *   POST /source-external/results
 *   Authorization: Bearer <token from the External source panel>
 *   Content-Type: application/json
 *   { "eventId": "…", "total": 1234.5, "items": [ … ], "observedAt": "…" }
 *
 * The route is outside NodeCG's login, so the bearer token is the only
 * gate; keep the server on the LAN or tailnet. Bodies are limited by
 * NodeCG's JSON parser (100 kB).
 */
export default function sourceExternal(
  nodecg: NodeCG.ServerAPI,
  core: FundraiserCoreApi = getCore(nodecg.extensions),
  secrets: SecretStore = secretStoreFor(SOURCE_ID),
) {
  const handle = core.registerSource(SOURCE_ID, { label: "External push" });
  const now = () => new Date().toISOString();
  const endpoint = nodecg.Replicant<EndpointReplicant>("endpoint", {
    defaultValue: { path: PUSH_PATH, tokenCreatedAt: null, lastPushAt: null },
  });
  const update = (patch: Partial<EndpointReplicant>) => {
    endpoint.value = { ...(JSON.parse(JSON.stringify(endpoint.value)) as EndpointReplicant), ...patch };
  };
  update({ path: PUSH_PATH, tokenCreatedAt: secrets.get(TOKEN_SCOPE, "createdAt") ?? null });

  /** Creates a new token, replacing any old one. Acks the token: the only time it's shown. */
  listenForCommand(nodecg, "rotateToken", z.undefined().or(z.null()), () => {
    const token = newToken();
    const createdAt = now();
    secrets.set(TOKEN_SCOPE, "tokenHash", hashToken(token));
    secrets.set(TOKEN_SCOPE, "createdAt", createdAt);
    update({ tokenCreatedAt: createdAt });
    handle.log("info", "Push token replaced");
    return token;
  });

  listenForCommand(nodecg, "revokeToken", z.undefined().or(z.null()), () => {
    secrets.deleteScope(TOKEN_SCOPE);
    update({ tokenCreatedAt: null });
    handle.log("info", "Push token revoked; pushes are refused until a new one is created");
  });

  const router = nodecg.Router();
  router.post(PUSH_PATH, (req, res) => {
    const response = handlePush(
      { authorization: req.get("authorization"), body: req.body },
      { tokenHash: secrets.get(TOKEN_SCOPE, "tokenHash"), handle, now },
    );
    const eventId = typeof req.body?.eventId === "string" ? req.body.eventId : null;
    if (response.status === 200) {
      update({ lastPushAt: now() });
      handle.setStatus({ state: "ok", message: "Receiving pushes", eventId });
    } else if (response.status === 401) {
      handle.log("warn", `Refused a push from ${req.ip}: bad token`);
    } else {
      handle.log("warn", `Rejected a push (${response.status}): ${response.body.error ?? response.body.outcome}`, eventId);
    }
    res.status(response.status).json(response.body);
  });
  nodecg.mount(router);

  handle.setStatus({ state: "idle", message: "Waiting for pushes" });
}
