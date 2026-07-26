import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { PublicUser } from "@/lib/types";

export type AuthStatus =
  | "idle"
  | "loading"
  | "authenticated"
  | "unauthenticated";

type AuthState = {
  accessToken: string | null;
  user: PublicUser | null;
  status: AuthStatus;
};

const initialState: AuthState = {
  accessToken: null,
  user: null,
  status: "idle",
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials(
      state,
      action: PayloadAction<{ accessToken: string; user: PublicUser }>,
    ) {
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
      state.status = "authenticated";
    },
    setAccessToken(state, action: PayloadAction<string>) {
      state.accessToken = action.payload;
      if (state.user) {
        state.status = "authenticated";
      }
    },
    setUser(state, action: PayloadAction<PublicUser>) {
      state.user = action.payload;
      if (state.accessToken) {
        state.status = "authenticated";
      }
    },
    setLoading(state) {
      state.status = "loading";
    },
    setUnauthenticated(state) {
      state.accessToken = null;
      state.user = null;
      state.status = "unauthenticated";
    },
    clearAuth(state) {
      state.accessToken = null;
      state.user = null;
      state.status = "unauthenticated";
    },
  },
});

export const {
  setCredentials,
  setAccessToken,
  setUser,
  setLoading,
  setUnauthenticated,
  clearAuth,
} = authSlice.actions;

export default authSlice.reducer;
