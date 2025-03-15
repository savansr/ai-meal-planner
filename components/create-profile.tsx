// components/CreateProfileOnSignIn.tsx

"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";

type ApiResponse = {
  message: string;
  error?: string;
};

export default function CreateProfileOnSignIn() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [profileCreationAttempted, setProfileCreationAttempted] = useState(false);
  
  // Define the mutation to create a profile
  const { mutate, isPending, isError, error } = useMutation<ApiResponse, Error>({
    mutationFn: async () => {
      if (!user || !user.id) {
        throw new Error("User not available");
      }
      
      console.log("Creating profile for user:", user.id);
      const email = user.primaryEmailAddress?.emailAddress;
      
      const res = await fetch("/api/create-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          email: email || ""
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create profile");
      }
      
      const data = await res.json();
      return data as ApiResponse;
    },
    onSuccess: (data) => {
      console.log("Profile creation success:", data.message);
      toast.success("Profile synchronized successfully.");
    },
    onError: (error) => {
      console.error("Error creating profile:", error);
      toast.error(`Error creating profile: ${error.message}`);
    },
  });

  useEffect(() => {
    // Only attempt to create a profile once and when we have user data
    if (isLoaded && isSignedIn && user && user.id && !isPending && !profileCreationAttempted) {
      console.log("User authenticated, attempting to create profile", {
        userId: user.id,
        email: user.primaryEmailAddress?.emailAddress
      });
      
      setProfileCreationAttempted(true);
      
      // Add a longer delay to ensure Clerk auth is fully propagated
      const timer = setTimeout(() => {
        mutate();
      }, 2000);
      
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, user]);

  return null; // This component doesn't render anything
}