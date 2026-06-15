import { useCallback, useEffect } from "react";
import {
  useAppDispatch,
  useAppSelector,
  useUserDetails,
} from "@renderer/hooks";
import {
  setOwnershipMap,
  setOwnershipLoading,
  updateFriendPresence,
  clearOwnershipMap,
  type FriendOwnershipMap,
} from "@renderer/features/friend-game-ownership-slice";
import type { ProfileFriends, UserProfile } from "@types";

const FETCH_CHUNK_SIZE = 5;

/**
 * Builds a game key from shop + objectId for matching.
 */
function buildGameKey(shop: string, objectId: string): string {
  return `${shop}:${objectId}`;
}

/**
 * Given a friend's UserProfile, map their library games to game keys
 * so we can match against the user's library.
 */
function extractFriendGameKeys(profile: UserProfile): string[] {
  return (profile.libraryGames ?? []).map((game) =>
    buildGameKey(game.shop, game.objectId)
  );
}

/**
 * Hook that fetches friends' library data and builds an ownership map
 * of gameId → { friends, onlineCount, totalCount }.
 */
export function useFriendGameOwnership() {
  const dispatch = useAppDispatch();
  const { userDetails } = useUserDetails();
  const { map, isLoading, hasLoaded } = useAppSelector(
    (state) => state.friendGameOwnership
  );

  const userId = userDetails?.id;

  const fetchOwnership = useCallback(async () => {
    if (!userId) return;

    dispatch(setOwnershipLoading(true));

    try {
      // 1. Get friends list
      const friendsResponse =
        await window.electron.hydraApi.get<ProfileFriends>("/profile/friends", {
          params: { take: 200, skip: 0 },
        });

      const friends = friendsResponse.friends;

      if (!friends.length) {
        dispatch(setOwnershipMap({}));
        return;
      }

      // 2. Fetch friend profiles in chunks
      const ownershipMap: FriendOwnershipMap = {};

      for (let i = 0; i < friends.length; i += FETCH_CHUNK_SIZE) {
        const chunk = friends.slice(i, i + FETCH_CHUNK_SIZE);

        const profiles = await Promise.all(
          chunk.map(async (friend) => {
            try {
              const profile = await window.electron.hydraApi.get<UserProfile>(
                `/profile/${friend.id}`
              );
              return { friend, profile };
            } catch {
              return { friend, profile: null };
            }
          })
        );

        // 3. Build ownership map
        for (const { friend, profile } of profiles) {
          if (!profile) continue;

          const gameKeys = extractFriendGameKeys(profile);

          for (const key of gameKeys) {
            if (!ownershipMap[key]) {
              ownershipMap[key] = {
                friends: [],
                onlineCount: 0,
                totalCount: 0,
              };
            }

            const isOnline = friend.isOnline ?? false;

            ownershipMap[key].friends.push({
              id: friend.id,
              displayName: friend.displayName,
              profileImageUrl: friend.profileImageUrl,
              isOnline,
            });

            ownershipMap[key].totalCount++;
            if (isOnline) ownershipMap[key].onlineCount++;
          }
        }
      }

      dispatch(setOwnershipMap(ownershipMap));
    } catch {
      dispatch(setOwnershipMap({}));
    }
  }, [userId, dispatch]);

  // Listen to presence updates
  useEffect(() => {
    if (typeof window.electron.onFriendPresence !== "function") return;

    const unsubscribe = window.electron.onFriendPresence(
      ({ friendId, isOnline }) => {
        dispatch(updateFriendPresence({ friendId, isOnline }));
      }
    );

    return () => {
      unsubscribe();
    };
  }, [dispatch]);

  // Fetch on mount when user is logged in
  useEffect(() => {
    if (userId && !hasLoaded && !isLoading) {
      fetchOwnership();
    }

    if (!userId && hasLoaded) {
      dispatch(clearOwnershipMap());
    }
  }, [userId, hasLoaded, isLoading, fetchOwnership, dispatch]);

  // Re-fetch when friends list changes
  useEffect(() => {
    const unsubscribe = window.electron.onFriendsUpdated(() => {
      fetchOwnership();
    });

    return () => {
      unsubscribe();
    };
  }, [fetchOwnership]);

  /**
   * Get ownership entry for a game by its shop and objectId.
   */
  const getOwnership = useCallback(
    (shop: string, objectId: string) => {
      const key = buildGameKey(shop, objectId);
      return map[key] ?? null;
    },
    [map]
  );

  return {
    getOwnership,
    isLoading,
    hasLoaded,
  };
}
