import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./auth-slice";

export function makeStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
    },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

/** Client-side singleton — never created during SSR. */
let store: AppStore | undefined;

export function getStore(): AppStore {
  if (typeof window === "undefined") {
    // SSR: return a fresh ephemeral store (not shared across requests).
    return makeStore();
  }
  if (!store) {
    store = makeStore();
  }
  return store;
}

export { store };
