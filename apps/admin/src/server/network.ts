import os from "node:os";

const virtualName =
  /vethernet|virtualbox|vmware|hyper-v|wsl|docker|loopback|bluetooth|npcap|tap|tun/i;

export type LanHost = {
  address: string;
  name: string;
  preferred: boolean;
};

export function listLanHosts(): LanHost[] {
  const hosts: LanHost[] = [];
  const interfaces = os.networkInterfaces();
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      if (entry.address.startsWith("169.254.")) continue;
      hosts.push({
        address: entry.address,
        name,
        preferred: !virtualName.test(name) && !entry.address.startsWith("192.168.56."),
      });
    }
  }
  hosts.sort((a, b) => Number(b.preferred) - Number(a.preferred));
  return hosts;
}

export function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  const ip = address.replace(/^::ffff:/, "");
  return ip === "127.0.0.1" || ip === "::1";
}
