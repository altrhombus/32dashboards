import { describe, expect, it } from "vitest";
import type { NetworkInterfaceInfo } from "node:os";
import { lanAddresses } from "./network.js";

const v4 = (address: string, internal = false) => ({ address, family: "IPv4", internal }) as NetworkInterfaceInfo;

describe("lanAddresses", () => {
  it("lists reachable IPv4 addresses, private ones first, without loopback or WSL's alias", () => {
    expect(
      lanAddresses({
        lo: [v4("127.0.0.1", true)],
        loopback0: [v4("10.255.255.254")],
        eth0: [v4("203.0.113.9"), { ...v4("fe80::1"), family: "IPv6" } as NetworkInterfaceInfo],
        eth1: [v4("192.168.1.20")],
      }),
    ).toEqual(["192.168.1.20", "203.0.113.9"]);
  });
});
