import { describe, it, expect, afterEach } from "vitest";
import { Resolver } from "node:dns/promises";
import { createSocket } from "node:dgram";
import {
  destination,
  isPublicAddress,
  resolveAddresses,
  validateAddresses,
} from "../packages/auth/src/destinations.js";
afterEach(() => {
  delete process.env["REQUIRE_UPSTREAM_TLS"];
  delete process.env["UPSTREAM_SERVICE_CIDR"];
});
describe("destination address and DNS boundaries", () => {
  it("rejects special IPv4/IPv6 encodings while retaining real global unicast", () => {
    for (const ip of [
      "0.1.2.3",
      "100.127.255.254",
      "192.0.2.1",
      "192.88.99.1",
      "198.51.100.3",
      "203.0.113.7",
      "240.1.2.3",
      "255.255.255.255",
      "1.2.3.999",
      "010.0.0.1",
      "::ffff:8.8.8.8",
      "::ffff:169.254.169.254",
      "64:ff9b::808:808",
      "fc00::1",
      "fe80::1",
      "2001:db8::1",
      "2001::1",
      "2002:0808:0808::",
      "3fff::1",
    ])
      expect(isPublicAddress(ip), ip).toBe(false);
    for (const ip of [
      "8.8.8.8",
      "1.1.1.1",
      "198.51.99.1",
      "203.0.114.1",
      "2606:4700:4700::1111",
      "2001:4860:4860::8888",
    ])
      expect(isPublicAddress(ip), ip).toBe(true);
  });
  it("validates all resolved families and rejects rebinding/foreign service ranges", () => {
    expect(() =>
      validateAddresses(
        [
          { address: "8.8.8.8", family: 4 },
          { address: "127.0.0.1", family: 4 },
        ],
        false,
      ),
    ).toThrow("DESTINATION_ADDRESS_DENIED");
    expect(() =>
      validateAddresses(
        [
          { address: "8.8.8.8", family: 4 },
          { address: "::1", family: 6 },
        ],
        false,
      ),
    ).toThrow();
    expect(() =>
      validateAddresses([{ address: "10.43.1.1", family: 4 }], true),
    ).not.toThrow();
    for (const address of ["10.42.1.1", "10.44.1.1", "169.254.169.254"])
      expect(() => validateAddresses([{ address, family: 4 }], true)).toThrow();
    expect(() =>
      validateAddresses([{ address: "8.8.8.8", family: 6 }], false),
    ).toThrow();
    process.env["REQUIRE_UPSTREAM_TLS"] = "true";
    expect(() =>
      destination(
        "http://relay-calendar.relay-upstreams.svc.cluster.local:3000/mcp",
      ),
    ).toThrow();
    expect(
      destination(
        "https://relay-calendar.relay-upstreams.svc.cluster.local:3000/mcp",
      ).protocol,
    ).toBe("https:");
  });
  it("resolves actual UDP DNS replies and rejects mixed public/metadata answers", async () => {
    const socket = createSocket("udp4");
    await new Promise<void>((r) => socket.bind(0, "127.0.0.1", r));
    socket.on("message", (q, remote) => {
      let end = 12;
      while (q[end] !== 0) end += q[end]! + 1;
      end += 5;
      const type = q.readUInt16BE(end - 4),
        h = Buffer.from(q.subarray(0, 12));
      h.writeUInt16BE(0x8180, 2);
      h.writeUInt16BE(type === 1 ? 2 : 0, 6);
      h.writeUInt16BE(0, 8);
      h.writeUInt16BE(0, 10);
      const rr = (octets: number[]) =>
        Buffer.from([0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 1, 0, 4, ...octets]);
      const response = Buffer.concat([
        h,
        q.subarray(12, end),
        ...(type === 1 ? [rr([8, 8, 8, 8]), rr([169, 254, 169, 254])] : []),
      ]);
      socket.send(response, remote.port, remote.address);
    });
    const resolver = new Resolver({ timeout: 200, tries: 1 });
    resolver.setServers([`127.0.0.1:${socket.address().port}`]);
    try {
      const answers = await resolveAddresses(
        "rebinding.example.invalid",
        undefined,
        resolver,
      );
      expect(answers).toHaveLength(2);
      expect(() => validateAddresses(answers, false)).toThrow(
        "DESTINATION_ADDRESS_DENIED",
      );
    } finally {
      socket.close();
    }
  });
  it("cancels silent DNS queries on deadline and abort without leaving requests active", async () => {
    const socket = createSocket("udp4");
    await new Promise<void>((r) => socket.bind(0, "127.0.0.1", r));
    const resolver = new Resolver({ timeout: 5000, tries: 1 });
    resolver.setServers([`127.0.0.1:${socket.address().port}`]);
    const start = Date.now();
    try {
      await expect(
        resolveAddresses(
          "silent.example.invalid",
          AbortSignal.timeout(30),
          resolver,
        ),
      ).rejects.toThrow();
      expect(Date.now() - start).toBeLessThan(1000);
    } finally {
      socket.close();
    }
  });
});
