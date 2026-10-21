// Each export becomes schemas/<name>.json, the JSON Schema NodeCG validates
// the Replicant of the same name against. Definitions live in
// @32dashboards/schema/core so panels, graphics, and adapters share them.
export {
  EventsReplicantSchema as events,
  ActiveEventIdReplicantSchema as activeEventId,
  SourceResultsReplicantSchema as sourceResults,
  RegisteredSourcesReplicantSchema as sources,
  LiveStateReplicantSchema as liveState,
  SourceLogReplicantSchema as sourceLog,
  MomentsReplicantSchema as moments,
  SceneReplicantSchema as scene,
  ScreensReplicantSchema as screens,
  OutputsReplicantSchema as outputs,
} from "@32dashboards/schema/core";
