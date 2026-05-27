import path from "path";
import dotenv from "dotenv";
import { getAppRoot } from "./utils/appRoot";

const appRoot = getAppRoot();

dotenv.config({
  path: path.join(appRoot, ".env"),
  override: process.env.NODE_ENV !== "production",
});

export { appRoot };
