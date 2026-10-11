// The adapter contract lives in @32dashboards/source-sdk so adapter bundles
// don't depend on this bundle's internals; fundraiser-core implements it.
export type {
  FundraiserCoreApi,
  ReportOutcome,
  SourceHandle,
  SourceReport,
  RegisterSourceOptions,
} from "@32dashboards/source-sdk";
