import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

export interface FriendOwnershipEntry {
  friends: Array<{
    id: string;
    displayName: string;
    profileImageUrl: string | null;
    isOnline: boolean;
  }>;
  onlineCount: number;
  totalCount: number;
}

/**
 * Map from game key (e.g. "steam:12345" or game.id) to friend ownership data.
 */
export type FriendOwnershipMap = Record<string, FriendOwnershipEntry>;

export interface FriendGameOwnershipState {
  map: FriendOwnershipMap;
  isLoading: boolean;
  hasLoaded: boolean;
}

const initialState: FriendGameOwnershipState = {
  map: {},
  isLoading: false,
  hasLoaded: false,
};

export const friendGameOwnershipSlice = createSlice({
  name: "friendGameOwnership",
  initialState,
  reducers: {
    setOwnershipMap: (state, action: PayloadAction<FriendOwnershipMap>) => {
      state.map = action.payload;
      state.hasLoaded = true;
      state.isLoading = false;
    },

    setOwnershipLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    updateFriendPresence: (
      state,
      action: PayloadAction<{ friendId: string; isOnline: boolean }>
    ) => {
      const { friendId, isOnline } = action.payload;

      for (const key of Object.keys(state.map)) {
        const entry = state.map[key];
        if (!entry) continue;

        const friendIndex = entry.friends.findIndex((f) => f.id === friendId);

        if (friendIndex === -1) continue;

        const wasOnline = entry.friends[friendIndex].isOnline;

        if (wasOnline === isOnline) continue;

        entry.friends[friendIndex] = {
          ...entry.friends[friendIndex],
          isOnline,
        };

        entry.onlineCount += isOnline ? 1 : -1;
      }
    },

    clearOwnershipMap: (state) => {
      state.map = {};
      state.isLoading = false;
      state.hasLoaded = false;
    },
  },
});

export const {
  setOwnershipMap,
  setOwnershipLoading,
  updateFriendPresence,
  clearOwnershipMap,
} = friendGameOwnershipSlice.actions;
