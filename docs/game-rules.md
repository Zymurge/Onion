# Onion Game Rules

This document maps the game rules for the "Onion" project, a thematic reimplementation of a classic asymmetrical tactical wargame.

The initial implementation will be based on the Mark III scenario, and the rules may be overly specific to that on the first pass.

## Overview

Onion is a hexagonal-grid tactical wargame where one player controls a single, massive super-tank called the **Onion**, and the other player controls a diverse force of conventional units (**Little Pigs**, **Big Bad Wolves**, **Puss**, etc.) defending a **Castle**.

## Units Mapping

Units are themed with Shrek-inspired names. Stats are listed as Attack/Range, Defense, Movement.

| Original Name | Onion Project Name | Stats | Move | Cost | Defense |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Ogre (Mk III) | **The Onion (Mk III)** | Variable | 3* | N/A | Variable |
| Heavy Tank | **Puss** | 4 / 2 | 3 | 1 | 3 |
| Missile Tank | **Witch** | 3 / 4 | 2 | 1 | 2 |
| GEV | **Big Bad Wolf** | 2 / 2 | 2 | 1 | 4+3 |
| Howitzer | **Lord Farquaad** | 6 / 8 | 1 | 2 | 0 |
| Light Tank | **Pinocchio** | 2 / 2 | 2 | 0.5 | 3 |
| Superheavy Tank | **Dragon** | 6(x2) / 3 | 5 | 2 | 3 |
| Infantry | **Little Pigs** | 1 (per squad) / 1 | 1 (squad) | 1 (per 3) | 2 |
| Command Post | **Castle** | 0 / 0 | 0 | N/A | 0 |

### Unit Special Abilities

- **Big Bad Wolf (GEV)**: Can move 4 hexes, fire, and then move an additional 3 hexes (Second Move Phase).
- **Little Pigs (Infantry)**: Can stack up to 3 squads per hex. Their defense is the sum of squads. They are the only units that can benefit from certain terrain cover. Attacks of "D" on a stack reduce it by 1 squad; "X" destroys the entire stack.
- **Lord Farquaad (Howitzer)**: Immobile once placed.
- **Dragon (Superheavy)**: A powerful conventional unit with two 6-strength attacks.
- **Castle (Command Post)**: The primary objective. Defense 0. Any "X" result against it wins the game for the Onion.
- **The Onion (Super-Unit)**:
  - **Main Battery (×1)**: Attack 4 / Range 3 / Defense 4.
  - **Secondary Battery (×4)**: Attack 3 / Range 2 / Defense 3.
  - **AP — Anti-Personnel (×8)**: Attack 1 / Range 1 / Defense 1. Effective only against Infantry and the Castle.
  - **Missiles (×2)**: Attack 6 / Range 5 / Defense 3. Single-use, exterior-mounted (individually targetable before launch). Only **one** missile may be launched per turn.
  - **Tread Calculation**: Mk III starts with **45 Tread Points**.
    - 31-45 Treads: **MA 3** | 16-30 Treads: **MA 2** | 1-15 Treads: **MA 1** | 0 Treads: **MA 0**

## Core Mechanics

### 1. Hexagonal Grid & Movement

- **Standard Movement**: Units move up to their Movement Allowance (MA).
- **Through Movement**: Units can move through hexes occupied by friendly units but **cannot** end their movement in the same hex (Stacking limit of 1 unit per hex, except for up to 3 Little Pigs squads).
- **Ramming**:
  - The Onion can ram up to **two** units per turn during its movement phase.
  - Ramming **Infantry (Little Pigs)** costs the Onion **0 treads**.
  - Ramming a normal armored unit costs the Onion **1 tread**.
  - Ramming a Superheavy (**Dragon**) costs the Onion **2 treads**.
  - The Onion rolls 1D6 for the ramming result (1-4: Target Destroyed).
- **Terrain & Cover**:
  - **Clear**: No effect on movement or combat.
  - **Craters**: Impassable to all units.
  - **Ridgelines**:
    - **Movement**: Impassable to armored units (Puss, Pinocchio, Dragon, Witch, Big Bad Wolf). The Onion and Little Pigs can cross ridgelines, but it costs 1 extra movement point to enter the hex.
    - **Cover**: Little Pigs in a Ridgeline hex gain +1 to their Defense strength (e.g., a 3-squad stack in cover has Defense 4).
- **Line of Sight & Angles**:
  - Engagement angles (Front/Back/Side) do **not** affect combat modifiers in standard rules. All units have 360-degree firing arcs.

### 2. Combat Resolution

- **Sequential Combat**: Players make attacks in any order and observe the result of each before declaring the next.
- **Combined Fire**: Multiple units can combine their attack strength against a single target (unless attacking Treads).
- **CRT Tables & Odds**: Ratios rounded down in favor of the defender.

  | Roll | 1:2 | 1:1 | 2:1 | 3:1 | 4:1 |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | 1 | NE | NE | NE | D | D |
  | 2 | NE | NE | D | D | X |
  | 3 | NE | D | D | X | X |
  | 4 | NE | D | X | X | X |
  | 5 | D | X | X | X | X |
  | 6 | X | X | X | X | X |

  - **1:3 or less**: Always NE regardless of roll.
  - **5:1 or more**: Always X (Destroyed) regardless of roll.
- **Infantry Stacks**: Each squad in a stack can attack individually or combine with others.

### 3. The Onion (Super-Unit) Damage

The Onion does not follow the standard CRT for destruction. Attackers must target individual subsystems. Only an **"X" (Destroyed)** result on the CRT has an effect on Onion components; a "D" (Disabled) result has **No Effect (NE)**.

#### Tread Attacks (Special Rule 7.13.2)

- **Individual Attacks Only**: Each unit attacking Treads must make an **individual attack**. Multiple units cannot combine fire against treads (Exception: up to 3 Little Pigs squads in the same hex may combine fire).
- **1-to-1 Odds**: All attacks on treads are resolved at **1:1 odds**, regardless of the attacker's strength.
- **Tread Damage**: On a roll of **5 or 6 (X result)**, the Onion loses a number of tread units equal to the **Attack Strength** of the attacking unit (e.g., a hit from **Puss** costs the Onion 4 treads).

#### Other Subsystems (Batteries & Missiles)

- **Targeting**: Each weapon system must be targeted individually at its specific defense value. Players can combine fire against these systems.
- **Subsystem Defense Values**:
  - **Main Battery**: Defense 4.
  - **Secondary Battery**: Defense 3.
  - **AP (Anti-Personnel)**: Defense 1.
  - **Missiles**: Defense 3.

## Turn Structure

1. **Onion Player Turn**
   - **Movement Phase**: Move the Onion (including ramming).
   - **Combat Phase**: Fire Onion weapons.
2. **Defender Player Turn**
   - **Recovery Phase**: "Disabled" units from previous turn return to normal.
   - **Movement Phase**: Move all conventional units.
   - **Combat Phase**: Fire all conventional units.
   - **Big Bad Wolf Second Move Phase**: Big Bad Wolves move their remaining 3 hexes.

For a practical demonstration of these rules in action, see the [Example Turn](example-turn.md).

## Victory Conditions

- **Onion Player**: Wins by destroying the **Castle** (Command Post). The Castle has Defense 0 — any successful attack result destroys it immediately.
- **Defender**: Wins by **immobilizing the Onion** before it destroys the Castle. The Onion is considered immobilized (and the Defender wins) when its tread points are reduced to **0 (MA 0)**. A stationary Onion cannot reach the Castle and poses no further threat.
  - Note: A fully armed but immobile Onion is still a Defender win — weapons alone cannot win the game for the Onion player.
