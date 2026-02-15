/**
 * Client Entry Point - Async Boundary
 *
 * This file serves as the async boundary for Module Federation.
 * The MF runtime will be initialized lazily when first needed.
 */

// Load the actual client application
import("./client");
