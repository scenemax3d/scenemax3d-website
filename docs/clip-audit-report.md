# Clip Audit Report

Updated on 2026-06-16 after pruning generated clips.

## Human-Edited Rule

A clip was protected as human generated/edited when its tutorial script either presents media (`[img:]`, `[img1:]`, `[img2:]`, `[video:]`, or video file references such as `.mp4`) or contains a code fence marker (` ``` `, ` ```+ `, or ` ```# `). All other clips were treated as computer generated.

## Totals

| Metric | Count |
| --- | ---: |
| Remaining clips | 102 |
| Human generated/edited clips kept | 71 |
| Generated placeholder clips kept | 31 |
| Generated clips removed in pruning pass | 452 |

## Category Summary

| Category | Clips | Human generated/edited | Generated placeholders |
| --- | ---: | ---: | ---: |
| Getting Started | 4 | 4 | 0 |
| SceneMax Language Fundamentals | 31 | 31 | 0 |
| Objects, Models, and Assets | 6 | 1 | 5 |
| Movement, Animation, and Replay | 10 | 7 | 3 |
| Cameras and Cinematics | 4 | 0 | 4 |
| Lighting and Visual Effects | 27 | 23 | 4 |
| Physics, Collisions, and Gameplay Systems | 8 | 4 | 4 |
| Screen, UI, and Drawing | 2 | 0 | 2 |
| IDE Designers and Authoring Tools | 4 | 0 | 4 |
| AI, MCP, Plugins, and Asset Automation | 5 | 1 | 4 |
| Packaging and Publishing | 1 | 0 | 1 |

## Subcategory Summary

| Category | Subcategory | Clips | Human generated/edited | Generated placeholders | Generated IDs kept |
| --- | --- | ---: | ---: | ---: | --- |
| Getting Started | Quick Start Flow | 3 | 3 | 0 | none |
| Getting Started | Screen Setup | 0 | 0 | 0 | none |
| SceneMax Language Fundamentals | Variables and Data Types | 12 | 12 | 0 | none |
| SceneMax Language Fundamentals | Arrays | 3 | 3 | 0 | none |
| SceneMax Language Fundamentals | Control Flow | 7 | 7 | 0 | none |
| SceneMax Language Fundamentals | Procedures and Functions | 6 | 6 | 0 | none |
| SceneMax Language Fundamentals | Events and Input | 3 | 3 | 0 | none |
| Objects, Models, and Assets | Primitive Objects | 1 | 0 | 1 | `primitive-objects` |
| Objects, Models, and Assets | 3D Models and Characters | 1 | 0 | 1 | `3d-character-models` |
| Objects, Models, and Assets | Colliders, Debug, and Resources | 1 | 0 | 1 | `colliders` |
| Objects, Models, and Assets | Sprites and Materials | 1 | 0 | 1 | `loading-sprites` |
| Objects, Models, and Assets | Object Lifecycle and Pools | 2 | 1 | 1 | `dynamic-type-creation` |
| Movement, Animation, and Replay | Movement and Rotation Basics | 1 | 0 | 1 | `move` |
| Movement, Animation, and Replay | Motion Easing | 2 | 1 | 1 | `motion-easing` |
| Movement, Animation, and Replay | 3D Animation Playback | 6 | 6 | 0 | none |
| Movement, Animation, and Replay | Path Replay | 1 | 0 | 1 | `basic-replay` |
| Cameras and Cinematics | Camera Basics | 1 | 0 | 1 | `rotate-camera` |
| Cameras and Cinematics | Cinematic Camera Rigs | 1 | 0 | 1 | `cinematic-camera` |
| Cameras and Cinematics | Camera Systems | 1 | 0 | 1 | `general-usage` |
| Cameras and Cinematics | Camera Modifiers | 1 | 0 | 1 | `camera-modifiers` |
| Lighting and Visual Effects | Lighting Foundations | 1 | 0 | 1 | `quick-example` |
| Lighting and Visual Effects | Light Types | 1 | 0 | 1 | `light-types-in-detail` |
| Lighting and Visual Effects | Lighting Recipes and Performance | 1 | 0 | 1 | `designer-workflow-2` |
| Lighting and Visual Effects | Effekseer Runtime Effects | 23 | 23 | 0 | none |
| Lighting and Visual Effects | Built-In Effects | 1 | 0 | 1 | `built-in-effects` |
| Physics, Collisions, and Gameplay Systems | Physics Motion | 1 | 0 | 1 | `physics-motion-commands` |
| Physics, Collisions, and Gameplay Systems | Collision Events | 2 | 1 | 1 | `joint-mapping` |
| Physics, Collisions, and Gameplay Systems | Audio | 3 | 3 | 0 | none |
| Physics, Collisions, and Gameplay Systems | Levels and Shared State | 1 | 0 | 1 | `switching-scenes` |
| Physics, Collisions, and Gameplay Systems | Minimap | 1 | 0 | 1 | `show-minimap` |
| Screen, UI, and Drawing | Screen and Canvas | 1 | 0 | 1 | `full-screen-mode` |
| Screen, UI, and Drawing | Runtime UI and Drawing | 1 | 0 | 1 | `header-text` |
| IDE Designers and Authoring Tools | Weapons Designer | 1 | 0 | 1 | `designer-workflow-3` |
| IDE Designers and Authoring Tools | Throw Motion Designer | 1 | 0 | 1 | `creating-a-throw-motion-asset` |
| IDE Designers and Authoring Tools | IK Designer | 1 | 0 | 1 | `designer-workflow` |
| IDE Designers and Authoring Tools | Effekseer Particle Designer | 1 | 0 | 1 | `why-a-new-path-is-required` |
| AI, MCP, Plugins, and Asset Automation | Built-In MCP Server | 3 | 2 | 1 | `claude-code-setup` |
| AI, MCP, Plugins, and Asset Automation | MCP Tool Reference | 1 | 0 | 1 | `how-to-read-this-reference` |
| AI, MCP, Plugins, and Asset Automation | Meshy AI Plugin | 1 | 0 | 1 | `plugin-registration` |
| AI, MCP, Plugins, and Asset Automation | Plugin System | 1 | 0 | 1 | `architecture` |
| Packaging and Publishing | itch.io Integration | 1 | 0 | 1 | `project-settings` |

