import { onRequestGet as __api_leaderboard_js_onRequestGet } from "C:\\Users\\brett\\walkermath\\functions\\api\\leaderboard.js"
import { onRequestPost as __api_leaderboard_js_onRequestPost } from "C:\\Users\\brett\\walkermath\\functions\\api\\leaderboard.js"

export const routes = [
    {
      routePath: "/api/leaderboard",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_leaderboard_js_onRequestGet],
    },
  {
      routePath: "/api/leaderboard",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_leaderboard_js_onRequestPost],
    },
  ]