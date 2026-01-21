# NEAR DNS Setup for Everything Gateway

This guide explains how to configure NEAR DNS so that `*.everything.near` domains resolve to the gateway.

## Overview

NEAR DNS is a decentralized DNS system that resolves blockchain-based domain names by querying smart contracts on NEAR Protocol. By deploying a DNS contract for `everything.near`, we can make all subaccount domains (like `efiz.everything.near`) resolve to the gateway.

**Docs:** https://github.com/frol/near-dns

**Public DNS Server:** `185.149.40.161:53`

## Prerequisites

1. **NEAR CLI** installed and configured
2. **Access to `everything.near` account** (or the parent account you're using)
3. **Gateway deployed** with a public IP address

## Step 1: Build the DNS Contract

```bash
# Clone the NEAR DNS repository
git clone https://github.com/frol/near-dns
cd near-dns/dns-contract

# Build the contract
cargo near build non-reproducible-wasm
```

The compiled contract will be at `target/near/dns_contract.wasm`.

## Step 2: Create DNS Subaccount

Create a `dns.everything.near` subaccount to hold the DNS contract:

```bash
# Create the DNS subaccount with 2.1 NEAR for storage
near account create-account fund-myself dns.everything.near '2.1 NEAR' \
  autogenerate-new-keypair save-to-keychain \
  sign-as everything.near network-config mainnet sign-with-keychain send
```

## Step 3: Deploy the DNS Contract

```bash
near contract deploy dns.everything.near \
  use-file target/near/dns_contract.wasm \
  with-init-call new json-args '{}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  network-config mainnet sign-with-keychain send
```

## Step 4: Add Wildcard A Record

Add a wildcard record that points all `*.everything.near` subdomains to the gateway:

```bash
# Replace <GATEWAY_IP> with your actual gateway IP address
near contract call-function as-transaction dns.everything.near dns_add \
  json-args '{"name": "*", "record": {"record_type": "A", "value": "<GATEWAY_IP>", "ttl": 300, "priority": null}}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  sign-as everything.near network-config mainnet sign-with-keychain send
```

## Step 5: Add Root A Record (Optional)

If you want `everything.near` itself to also resolve:

```bash
near contract call-function as-transaction dns.everything.near dns_add \
  json-args '{"name": "@", "record": {"record_type": "A", "value": "<GATEWAY_IP>", "ttl": 300, "priority": null}}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  sign-as everything.near network-config mainnet sign-with-keychain send
```

## Step 6: Verify DNS Resolution

Test that the DNS records are working:

```bash
# Query using the NEAR DNS server
dig @185.149.40.161 efiz.everything.near A

# Expected response:
# efiz.everything.near.    300    IN    A    <GATEWAY_IP>

# Query the root domain
dig @185.149.40.161 everything.near A
```

## Managing DNS Records

### List All Records

```bash
near contract call-function as-read-only dns.everything.near dns_list_all \
  json-args '{}' network-config mainnet now
```

### Query Specific Record

```bash
near contract call-function as-read-only dns.everything.near dns_query \
  json-args '{"name": "*", "record_type": "A"}' \
  network-config mainnet now
```

### Update a Record

To update a record, delete the old one and add the new one:

```bash
# Delete old record
near contract call-function as-transaction dns.everything.near dns_delete \
  json-args '{"name": "*", "record_type": "A"}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  sign-as everything.near network-config mainnet sign-with-keychain send

# Add new record with updated IP
near contract call-function as-transaction dns.everything.near dns_add \
  json-args '{"name": "*", "record": {"record_type": "A", "value": "<NEW_IP>", "ttl": 300, "priority": null}}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  sign-as everything.near network-config mainnet sign-with-keychain send
```

## How It Works

When a user visits `efiz.everything.near`:

1. **DNS Query:** Client queries the NEAR DNS server for `efiz.everything.near`
2. **Contract Lookup:** Server queries `dns.everything.near` contract
3. **Wildcard Match:** No exact match for `efiz`, so `*` wildcard is used
4. **Response:** Returns the gateway IP from the wildcard record
5. **Connection:** Client connects to gateway IP
6. **Routing:** Gateway extracts `efiz` from hostname and routes to tenant

## Resolution Logic

NEAR DNS resolves in this order:

1. Check `dns.efiz.everything.near` with name `@` (if tenant has their own DNS)
2. Check `dns.everything.near` with name `efiz` (explicit subdomain record)
3. Check `dns.everything.near` with name `*` (wildcard record) ← This is what we use
4. Return NXDOMAIN if no match

## Running Your Own DNS Server

For production, you may want to run your own NEAR DNS server:

```bash
# Using Docker
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

For testing on testnet:

```bash
# Create DNS subaccount
near account create-account fund-myself dns.everything.testnet '2.1 NEAR' \
  autogenerate-new-keypair save-to-keychain \
  sign-as everything.testnet network-config testnet sign-with-keychain send

# Deploy contract
near contract deploy dns.everything.testnet \
  use-file target/near/dns_contract.wasm \
  with-init-call new json-args '{}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  network-config testnet sign-with-keychain send

# Add wildcard
near contract call-function as-transaction dns.everything.testnet dns_add \
  json-args '{"name": "*", "record": {"record_type": "A", "value": "<GATEWAY_IP>", "ttl": 300, "priority": null}}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  sign-as everything.testnet network-config testnet sign-with-keychain send

# Test with testnet DNS
dig @185.149.40.161 efiz.everything.testnet A
```

## Troubleshooting

### DNS Not Resolving

1. Verify the DNS contract is deployed: 
   ```bash
   near contract call-function as-read-only dns.everything.near dns_list_all json-args '{}' network-config mainnet now
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
near contract call-function as-read-only dns.everything.near dns_query \
  json-args '{"name": "efiz", "record_type": "A"}' \
  network-config mainnet now
```
