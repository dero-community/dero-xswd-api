import { describe, expect, test } from "@jest/globals";
import { generateAppId } from "../src";

const appName = "test";

describe("utils", () => {
  test("generates app id", async () => {
    const id = generateAppId(appName);
    console.log({ id });

    expect(id.length).toBe(64);
  });
});
