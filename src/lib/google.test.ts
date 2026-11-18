import { beforeEach, describe, expect, it, vi } from "vitest";

const signIn = vi.fn();
const setSession = vi.fn();
vi.mock("@lovable.dev/cloud-auth-js", () => ({ createLovableAuth: () => ({ signInWithOAuth: signIn }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { setSession } } }));
const { continueWithGoogle } = await import("./google");

beforeEach(() => { signIn.mockReset(); setSession.mockReset(); });

describe("Continue with Google", () => {
  it("asks Lovable Cloud for Google and comes back to this site", async () => {
    signIn.mockResolvedValue({ error: null, redirected: true });
    await expect(continueWithGoogle()).resolves.toBeNull();
    expect(signIn).toHaveBeenCalledWith("google", { redirect_uri: window.location.origin });
    expect(setSession).not.toHaveBeenCalled();
  });
  it("starts the Cloud session when the pop-up returns tokens (editor preview)", async () => {
    const tokens = { access_token: "a", refresh_token: "r" };
    signIn.mockResolvedValue({ tokens, error: null });
    setSession.mockResolvedValue({ error: null });
    await expect(continueWithGoogle()).resolves.toBeNull();
    expect(setSession).toHaveBeenCalledWith(tokens);
  });
  it("explains a blocked pop-up", async () => {
    signIn.mockResolvedValue({ error: new Error("Popup was blocked") });
    await expect(continueWithGoogle()).resolves.toMatch(/allow pop-ups/i);
  });
  it("falls back to a friendly message if Google sign-in is unavailable", async () => {
    signIn.mockRejectedValue(new Error("network"));
    await expect(continueWithGoogle()).resolves.toMatch(/mobile number or email/);
  });
});
