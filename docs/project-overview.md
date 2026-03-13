# Onion Web Game Project Overview

## Project Description

This project aims to create a web-based digital implementation of the classic board game Ogre (now renamed Onion) designed by Steve Jackson. The game will be developed as an open-source project, utilizing publicly available information about the game's rules, mechanics, and components. Any elements that are copyrighted or proprietary will be adapted or replaced to ensure the project remains compliant with open-source licensing and intellectual property laws.

Onion is an asymmetrical tactical wargame set in a near-future sci-fi setting where one player controls a massive cybernetic tank called the "Onion" against another player's defensive forces consisting of conventional military units like tanks, infantry, and artillery.

## Game Mechanics Summary

Based on public domain descriptions:

- **Asymmetrical Gameplay**: One player commands the Onion, a powerful super-tank, while the other defends with a mix of infantry, armor, and artillery units.

- **Components**:
  - Hexagonal grid map with terrain features (ridgelines, craters).
  - Web-based interface to manage turns and combat logic.
  - Integration with JSON-based scenario configurations.
  - An API interface to the game engine service to allow multiple client types to play.
  - An AI engine that can play either side, via the API.
  
_Note: the initial implementation will be on the Mark III scenario. Some scenario configurable concepts may initiall be hard coded._

Detailed rules and unit mappings can be found in [game-rules.md](game-rules.md). For a sample turn walkthrough, check out [example-turn.md](example-turn.md).

## Name Changes

To avoid proprietary issues and add a fun, thematic twist, we'll rename elements using Shrek-inspired names:

- **The Onion**: Massive autonomous tank (Ogre).
- **Big Bad Wolf**: Ground Effect Vehicle (GEV).
- **Lord Farquaad**: Howitzer (Stationary artillery).
- **Puss**: Heavy Tank.
- **Witch**: Missile Tank.
- **Pinocchio**: Light Tank.
- **Dragon**: Superheavy Tank.
- **Little Pig**: Infantry squads.
- **Castle**: Command Post.

## Next Steps

- **JSON Scenario Configuration**: Define a schema for loading maps, unit allotments, and victory conditions to avoid hard-coding.
- **Turn Engine**: Implement the state machine for movement, combat, and recovery phases.
