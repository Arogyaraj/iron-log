import { route } from "../lib/routes.js";

// Every /api/* request lands here. See lib/routes.js for the endpoints.
export default function handler(req, res) {
  return route(req, res);
}
