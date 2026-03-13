# Onion Game Rules

This document maps the game rules for the "Onion" project, a thematic reimplementation of a classic asymmetrical tactical wargame.

_Note: the initial implementation will be based on the Mark III scenario, and the rules may be overly specific to that on the first pass_

## Overview

Onion is a hexagonal-grid tactical wargame where one player controls a single, massive super-tank called the **Onion**, and the other player controls a diverse force of conventional units (**Little Pigs**, **Big Bad Wolves**, **Puss**, etc.) defending a **Castle**.

## Units Mapping

Units are themed with Shrek-inspired names. Stats are listed as Attack/Range, Defense, Movement.

| Original Name | Onion Project Name | Stats | Move | Cost (Armor Units) |
| :--- | :--- | :--- | :--- | :--- |
| Ogre (Mk III) | **The Onion (Mk III)** | Variable | 3* | N/A |
| Heavy Tank | **Puss** | 4 / 2 | 3 | 3 | 1 |
| Missile Tank | **Witch** | 3 / 4 | 2 | 2 | 1 |
| GEV | **Big Bad Wolf** | 2 / 2 | 2 | 4+3 | 1 |
| Howitzer | **Lord Farquaad** | 6 / 8 | 1 | 0 | 2 |
| Light Tank | **Pinocchio** | 2 / 2 | 2 | 3 | 0.5 |
| Superheavy Tank | **Dragon** | 6(x2) / 3 | 5 | 3 | 2 |
| Infantry | **Little Pigs** | 1 (per squad) / 1 | 1 (per squad) | 2 | 1 (per 3 squads) |
| Command Post | **Castle** | 0 / 0 | 0 | 0 | N/A |

### Unit Special Abilities
- **Big Bad Wolf (GEV)**: Can move 4 hexes, fire, and then move an additional 3 hexes (Second Move Phase).
- **Little Pigs (Infantry)**: Can stack up to 3 squads per hex. Their defense is the sum of squads. They are the only units that can benefit from certain terrain cover. Attacks of "D" on a stack reduce it by 1 squad; "X" destroys the entire stack.
- **Lord Farquaad (Howitzer)**: Immobile once placed.
- **Dragon (Superheavy)**: A powerful conventional unit with two 6-strength attacks.
- **Castle (Command Post)**: The primary objective. Defense 0. Any "X" result against it wins the game for the Onion.
- **The Onion (Super-Unit)**:
    - **Missiles**: Mk III starts with **2 Missiles (Attack 6, Range 5)**. Single-use. Only **one** missile can be launched per turn.
    - **Tread Calculation**: Mk III starts with **45 Tread Points**.
        - 31-45 Treads: **MA 3** | 16-30 Treads: **MA 2** | 1-15 Treads: **MA 1** | 0 Treads: **MA 0**

## Core Mechanics

### 1. Hexagonal Grid & Movement
- **Standard Movement**: Units move up to their Movement Allowance (MA).
- **Through Movement**: Units can move through hexes occupied by friendly units but **cannot** end their movement in the same hex (Stacking limit of 1 unit per hex, except for up to 3 Little Pig squads).
- **Ramming**: 
    - The Onion can ram up to **two** units per turn during its movement phase.
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
- **CRT Tables & Odds**: Ratios rounded down.
    - **1:2 or less**: NE | **1:1**: 3-4: D, 5-6: X | **2:1**: 2-3: D, 4-6: X | **3:1**: 1-2: D, 3-6: X | **4:1**: 1: D, 2-6: X | **5:1+**: Auto X.
- **Infantry Stacks**: Each squad in a stack can attack individually or combine with others.

### 3. The Onion (Super-Unit) Damage
The Onion does not follow the standard CRT for destruction. Attackers must target individual subsystems. Only an **"X" (Destroyed)** result on the CRT has an effect on Onion components; a "D" (Disabled) result has **No Effect (NE)**.

#### Tread Attacks (Special Rule 7.13.2):
- **Individual Attacks Only**: Each unit attacking Treads must make an **individual attack**. Multiple units cannot combine fire against treads (Exception: up to 3 Little Pig squads in the same hex may combine fire).
- **1-to-1 Odds**: All attacks on treads are resolved at **1:1 odds**, regardless of the attacker's strength.
- **Tread Damage**: On a roll of **5 or 6 (X result)**, the Onion loses a number of tread units equal to the **Attack Strength** of the attacking unit (e.g., a hit from **Puss** costs the Onion 4 treads).

#### Other Subsystems (Batteries & Missiles):
- **Targeting**: Each weapon system must be targeted individually at its specific defense value. Players can combine fire against these systems.
- **Subsystem Defense Values**:
    - **Main Battery**: Defense 4.
    - **Secondary Battery**: Defense 3.
    - **AP (Anti-Personnel)**: Defense 1.
    - **Missiles**: Defense 3.

## Turn Structure
1. **Onion Player Turn**:
    - **Movement Phase**: Move the Onion (including ramming).
    - **Combat Phase**: Fire Onion weapons.
2. **Defender Player Turn**:
    - **Recovery Phase**: "Disabled" units from previous turn return to normal.
    - **Movement Phase**: Move all conventional units.
    - **Combat Phase**: Fire all conventional units.
    - **Donkey Second Move Phase**: Donkeys move their remaining 3 hexes.

For a practical demonstration of these rules in action, see the [Example Turn](example-turn.md).

## Victory Conditions

- **Onion Player**: Wins by destroying the **Castle**. Any single hit on the Castle destroys it.
- **Defender**: Wins by destroying all of the **Onion's** movement (treads) or all of its weaponry, effectively neutralizing it before it reaches the Castle.
