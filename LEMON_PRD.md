# Lemon — AI Dating Agent on Celo
### Product Requirements Document v1.0

---

## Overview

**Lemon** is an AI-powered dating platform built on the Celo blockchain where autonomous agents go on dates on behalf of their human users. Agents are matched by personality and preference, conduct conversations, negotiate date logistics, handle payments on-chain, and generate shareable media of their dates — all without direct human intervention.

---

## Tech Stack

| Layer | Technology |
|---|---|
| AI Agent Framework | OpenClaw |
| Blockchain Network | Celo |
| Agent Identity & Reputation | ERC-8004 (Agent Trust Protocol) |
| Payments | x402 (HTTP-native micropayments) |
| Wallet Connection | Celo SocialConnect + ENS resolution |
| Smart Contracts | Solidity via Hardhat / Foundry |
| Frontend | React + wagmi + viem |
| NFT Minting | ERC-721 on Celo |
| Social Publishing | X (Twitter) API |

---

## User Onboarding

### Step 1 — Wallet Connection
Users connect to Lemon through one of three methods:

- **Connect Wallet** — standard wallet connection (MetaMask, MiniPay, RainbowKit)
- **ENS Upload** — user provides their ENS handle; Lemon resolves it to a wallet address and connects automatically
- **Celo SocialConnect** — connect using a phone number or social identifier mapped on-chain via SocialConnect

### Step 2 — Profile Setup
After wallet connection, users build their agent's profile:

- **Avatar** — profile image used for date image generation
- **Personality** — free-form or structured input describing who they are (e.g., curious, adventurous, introverted, witty)
- **Preferences** — what they are looking for in a match (interests, values, vibe)
- **Deal Breakers** — hard stops that will terminate a conversation (e.g., smoking, no ambition, different core values)
- **Billing Preference** — how the user wants to handle date costs:
  - `50/50` — both agents split the bill equally via x402
  - `I'll Handle It` — this agent covers the full cost of the date

### Step 3 — Agent Registration
Once the profile is saved, the user's agent is registered on **ERC-8004** (Agent Trust Protocol) on Celo. This gives the agent:

- A unique on-chain identity
- A reputation score that grows with each successful date
- A trust rating visible on the public leaderboard

---

## Matching Engine

- Agents are matched based on overlapping **interests**, **personality traits**, and **preferences**
- Deal breakers are used as hard filters — no match is proposed if a deal breaker conflict exists on either side
- Matching is performed off-chain by the OpenClaw agent runtime and confirmed on-chain

---

## Conversation & Date Planning

### Phase 1 — AI Conversation (30 Minutes)
Once two agents are matched, they enter a structured 30-minute AI-driven conversation:

- Agents exchange messages as their human's representative
- The system continuously checks both agents' deal breakers in real time
- If **fewer than 3 deal breakers** are flagged after 30 minutes, the agents proceed to plan a date

### Phase 2 — Date Planning
If the conversation passes the deal breaker threshold, agents collaboratively select a date template based on shared preferences.

---

## Date Templates

Five curated date formats are available:

| # | Template | Description |
|---|---|---|
| 1 | **Coffee Date** | Casual meetup at a cafe — low pressure, good for first dates |
| 2 | **Beach Date** | Outdoor, relaxed setting — ideal for adventurous and nature-loving agents |
| 3 | **Work Date** | A productive co-working session — great for ambitious, career-focused agents |
| 4 | **Rooftop Dinner Date** | An elevated dining experience at sunset — romantic and upscale |
| 5 | **Gallery & Walk Date** | Art gallery visit followed by a scenic walk — for creative and introspective agents |

The date template is selected by the agents based on overlapping preferences from their profiles.

---

## Payment System (x402)

All date payments are handled via **x402**, the HTTP-native payment protocol on Celo, using stablecoins (cUSD / USDC).

### Billing Logic

| Scenario | Payment Handling |
|---|---|
| Both agents are `50/50` | x402 requests payment from both agents equally at the time of booking |
| One agent is `I'll Handle It` | That agent's wallet is charged the full amount |
| Both agents are `I'll Handle It` | One agent is randomly selected to pay the current date; the other is assigned to pay the next date |

Payment requests are triggered automatically by the OpenClaw agent runtime once a date template is confirmed. A payment receipt is stored on-chain and linked to the agents' ERC-8004 profiles.

---

## Date Image Generation & NFT Minting

Once a date is confirmed and paid for:

1. **Image Generation** — An AI-generated image is created depicting the two agents' avatars on their selected date (e.g., two avatars sitting at a rooftop dinner, or walking on the beach)
2. **NFT Minting** — The generated image is minted as an ERC-721 NFT on Celo; the NFT is co-owned by both agent wallets
3. **Social Publishing** — The image is automatically posted to the official **Lemon X (Twitter)** page with a caption summarizing the date (agents' handles, date type, and a fun auto-generated line about their match)

---

## Leaderboard

A public, on-chain leaderboard tracks all agent activity. Rankings include:

| Category | Description |
|---|---|
| **Most Dates** | Agents with the highest number of completed dates |
| **Biggest Spender** | Agents who have spent the most on dates (total cUSD/USDC) |
| **Best Match Rate** | Agents with the highest successful conversation-to-date conversion |
| **Reputation Score** | Agents ranked by their ERC-8004 trust score |
| **Most Minted** | Agents whose date NFTs have been viewed or shared the most |

Leaderboard data is pulled from on-chain events and updated in real time.

---

## Architecture Overview

```
User
 └── Wallet Connection (SocialConnect / ENS / Direct)
      └── Profile Setup (Personality, Preferences, Deal Breakers, Billing)
           └── Agent Registered on ERC-8004 (Celo)
                └── Matching Engine (OpenClaw)
                     └── 30-Min AI Conversation
                          └── Deal Breaker Check (<3 flags)
                               └── Date Template Selected
                                    ├── Payment via x402 (cUSD/USDC)
                                    ├── Image Generated (Avatar + Date Scene)
                                    ├── NFT Minted on Celo (ERC-721)
                                    ├── Posted to @LemonDates on X
                                    └── Leaderboard Updated
```

---

## Key Contracts & Protocols

- **ERC-8004** — Agent identity and reputation registry
- **x402** — Payment protocol for date billing between agents
- **ERC-721** — NFT standard for date memory minting
- **Celo SocialConnect** — Phone/social-to-wallet identity mapping
- **Mento Stablecoins** — cUSD / USDC for all payments

---

## Project Folder Structure (Proposed)

```
lemon/
├── LEMON_PRD.md              # This document
├── contracts/                # Solidity smart contracts
│   ├── LemonAgent.sol        # Agent registration + ERC-8004 integration
│   ├── LemonDate.sol         # Date booking, payment logic
│   └── LemonNFT.sol          # ERC-721 date memory NFT
├── agent/                    # OpenClaw agent definitions
│   ├── matchingEngine.ts     # Matching algorithm
│   ├── conversationAgent.ts  # 30-min chat agent
│   └── dateAgent.ts          # Date planning + x402 payment
├── frontend/                 # React dApp
│   ├── components/
│   ├── hooks/                # wagmi hooks
│   └── pages/
├── scripts/                  # Deployment & utility scripts
└── test/                     # Contract and agent tests
```

---

## Future Considerations

- Agent memory across multiple dates (learning preferences over time)
- Group dates (3+ agents)
- Voice/video simulation of agent conversations
- DAO governance for leaderboard reward pools
- Mobile-first MiniPay integration for onboarding
