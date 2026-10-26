import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

/** WSL's internal alias for the Windows host under mirrored networking; not reachable from other devices. */
const WSL_LOOPBACK_ALIAS = "10.255.255.254";

/**
 * Addresses another device on the venue network might reach this laptop at:
 * IPv4, not loopback, private ranges first. Under WSL mirrored networking
 * these are the laptop's own Windows addresses.
 */
export function lanAddresses(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): string[] {
  const isPrivate = (a: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a);
  return Object.values(interfaces)
    .flatMap((list) => list ?? [])
    .filter((i) => i.family === "IPv4" && !i.internal && i.address !== WSL_LOOPBACK_ALIAS)
    .map((i) => i.address)
    .sort((a, b) => Number(isPrivate(b)) - Number(isPrivate(a)));
}
