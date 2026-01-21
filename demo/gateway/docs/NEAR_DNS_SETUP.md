# NEAR DNS Setup for Gateway

This guide explains how to configure NEAR DNS so that `*.<your-account>.near` domains resolve to your gateway.

## Overview

NEAR DNS is a decentralized DNS system that resolves blockchain-based domain names by querying smart contracts on NEAR Protocol. By deploying a DNS contract for your account, you can make all subaccount domains resolve to your gateway.

**Docs:** https://github.com/frol/near-dns

**Public DNS Server:** `185.149.40.161:53`

## Prerequisites

1. **NEAR CLI** installed and configured
2. **Access to your NEAR account** (the gateway account)
3. **Gateway deployed** with a public IP address

## Variables

Replace these throughout the guide:
- `<YOUR_ACCOUNT>` - Your gateway account (e.g., `efiz.near`)
- `<GATEWAY_IP>` - Your gateway's public IP address

## Step 1: Build the DNS Contract

```bash
git clone https://github.com/frol/near-dns
cd near-dns/dns-contract

cargo near build non-reproducible-wasm
```

The compiled contract will be at `target/near/dns_contract.wasm`.

## Step 2: Create DNS Subaccount

Create a `dns.<YOUR_ACCOUNT>` subaccount to hold the DNS contract:

```bash
near account create-account fund-myself dns.<YOUR_ACCOUNT> '2.1 NEAR' \
  autogenerate-new-keypair save-to-keychain \
  sign-as <YOUR_ACCOUNT> network-config mainnet sign-with-keychain send
```

## Step 3: Deploy the DNS Contract

```bash
near contract deploy dns.<YOUR_ACCOUNT> \
  use-file target/near/dns_contract.wasm \
  with-init-call new json-args '{}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  network-config mainnet sign-with-keychain send
```

## Step 4: Add Wildcard A Record

Add a wildcard record that points all `*.<YOUR_ACCOUNT>` subdomains to the gateway:

```bash
near contract call-function as-transaction dns.<YOUR_ACCOUNT> dns_add \
  json-args '{"name": "*", "record": {"record_type": "A", "value": "<GATEWAY_IP>", "ttl": 300, "priority": null}}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  sign-as <YOUR_ACCOUNT> network-config mainnet sign-with-keychain send
```

## Step 5: Add Root A Record (Optional)

If you want `<YOUR_ACCOUNT>` itself to also resolve:

```bash
near contract call-function as-transaction dns.<YOUR_ACCOUNT> dns_add \
  json-args '{"name": "@", "record": {"record_type": "A", "value": "<GATEWAY_IP>", "ttl": 300, "priority": null}}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  sign-as <YOUR_ACCOUNT> network-config mainnet sign-with-keychain send
```

## Step 6: Verify DNS Resolution

Test that the DNS records are working:

```bash
dig @185.149.40.161 tenant.<YOUR_ACCOUNT> A

dig @185.149.40.161 <YOUR_ACCOUNT> A
```

## Managing DNS Records

### List All Records

```bash
near contract call-function as-read-only dns.<YOUR_ACCOUNT> dns_list_all \
  json-args '{}' network-config mainnet now
```

### Query Specific Record

```bash
near contract call-function as-read-only dns.<YOUR_ACCOUNT> dns_query \
  json-args '{"name": "*", "record_type": "A"}' \
  network-config mainnet now
```

### Update a Record

To update a record, delete the old one and add the new one:

```bash
near contract call-function as-transaction dns.<YOUR_ACCOUNT> dns_delete \
  json-args '{"name": "*", "record_type": "A"}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  sign-as <YOUR_ACCOUNT> network-config mainnet sign-with-keychain send

near contract call-function as-transaction dns.<YOUR_ACCOUNT> dns_add \
  json-args '{"name": "*", "record": {"record_type": "A", "value": "<NEW_IP>", "ttl": 300, "priority": null}}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  sign-as <YOUR_ACCOUNT> network-config mainnet sign-with-keychain send
```

## How It Works

When a user visits `tenant.<YOUR_ACCOUNT>`:

1. **DNS Query:** Client queries the NEAR DNS server for `tenant.<YOUR_ACCOUNT>`
2. **Contract Lookup:** Server queries `dns.<YOUR_ACCOUNT>` contract
3. **Wildcard Match:** No exact match for `tenant`, so `*` wildcard is used
4. **Response:** Returns the gateway IP from the wildcard record
5. **Connection:** Client connects to gateway IP
6. **Routing:** Gateway extracts `tenant` from hostname and routes to tenant

## Resolution Logic

NEAR DNS resolves in this order:

1. Check `dns.tenant.<YOUR_ACCOUNT>` with name `@` (if tenant has their own DNS)
2. Check `dns.<YOUR_ACCOUNT>` with name `tenant` (explicit subdomain record)
3. Check `dns.<YOUR_ACCOUNT>` with name `*` (wildcard record) ← This is what we use
4. Return NXDOMAIN if no match

## Custom Domains (Non-.near)

For custom domains like `website.com`, you don't need NEAR DNS. Instead:

1. **Cloudflare DNS** (or your DNS provider):
   - Add A record: `website.com` → `<GATEWAY_IP>`
   - Add wildcard: `*.website.com` → `<GATEWAY_IP>` (or CNAME to Worker)

2. **SSL Certificates**: Cloudflare automatically handles SSL for domains on their platform

3. **Gateway Configuration**: Set `GATEWAY_DOMAIN=website.com` in wrangler.toml

## Running Your Own DNS Server

For production, you may want to run your own NEAR DNS server:

```bash
docker run -d --name near-dns \
  -p 53:53/udp \
  -p 53:53/tcp \
  frolvlad/near-dns

# Or build from source
cd near-dns/dns-server
cargo build --release
./target/release/near-dns-server \
  --bind 0.0.0.0:53 \
  --rpc-url https://rpc.mainnet.near.org
```

## Supported TLDs

NEAR DNS recognizes these TLDs:
- `.near` (mainnet)
- `.testnet`
- `.aurora`
- `.tg`
- `.sweat`
- `.kaiching`
- `.sharddog`

All other TLDs are forwarded to upstream DNS servers.

## Testnet Setup

For testing on testnet, replace `mainnet` with `testnet` in all commands:

```bash
near account create-account fund-myself dns.<YOUR_ACCOUNT>.testnet '2.1 NEAR' \
  autogenerate-new-keypair save-to-keychain \
  sign-as <YOUR_ACCOUNT>.testnet network-config testnet sign-with-keychain send

near contract deploy dns.<YOUR_ACCOUNT>.testnet \
  use-file target/near/dns_contract.wasm \
  with-init-call new json-args '{}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  network-config testnet sign-with-keychain send

near contract call-function as-transaction dns.<YOUR_ACCOUNT>.testnet dns_add \
  json-args '{"name": "*", "record": {"record_type": "A", "value": "<GATEWAY_IP>", "ttl": 300, "priority": null}}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  sign-as <YOUR_ACCOUNT>.testnet network-config testnet sign-with-keychain send

dig @185.149.40.161 tenant.<YOUR_ACCOUNT>.testnet A
```

## Troubleshooting

### DNS Not Resolving

1. Verify the DNS contract is deployed: 
   ```bash
   near contract call-function as-read-only dns.<YOUR_ACCOUNT> dns_list_all json-args '{}' network-config mainnet now
   ```

2. Check you're using the NEAR DNS server: `dig @185.149.40.161 ...`

3. Verify the wildcard record exists and has the correct IP

### Timeout Issues

The NEAR DNS server queries the blockchain, which can be slow. Consider:
- Running your own DNS server closer to your users
- Using DNS caching (records have TTL)

### Wrong IP Returned

Check for more specific records that might override the wildcard:
```bash
near contract call-function as-read-only dns.<YOUR_ACCOUNT> dns_query \
  json-args '{"name": "tenant", "record_type": "A"}' \
  network-config mainnet now
```
