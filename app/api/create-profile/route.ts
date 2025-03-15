import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@clerk/nextjs/server";

// Function to sanitize strings for PostgreSQL
function sanitizeForPostgres(input: string): string {
  if (!input) return "";
  
  // Remove null bytes and other problematic characters
  return input
    .replace(/\u0000/g, '') // Remove null bytes
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\0/g, "") // Remove control characters
    .trim();
}

function enforceUTF8(input: string): string {
  return Buffer.from(input, 'utf8').toString('utf8');
}


export async function POST(request: NextRequest) {
  console.log("Request to create-profile API started");
  try {
    // First try to get user from the request body
    let userId = "", email = "";
    
    try {
      const body = await request.json();
      userId = body.userId || "";
      email = body.email || "";
      console.log("Raw user data from request body:", { userId, email });
    } catch (error) {
      console.log("Failed to parse request body:", error);
    }
    
    // If we don't have userId from the request body, try Clerk's currentUser
    if (!userId) {
      try {
        const clerkUser = await currentUser();
        
        if (clerkUser) {
          userId = clerkUser.id || "";
          email = clerkUser.emailAddresses?.[0]?.emailAddress || "";
          console.log("Raw user data from Clerk:", { userId, email });
        } else {
          console.error("No Clerk user found");
        }
      } catch (clerkError) {
        console.error("Error fetching Clerk user:", clerkError);
      }
    }
    
    if (!userId) {
      console.error("No user ID available from any source");
      return NextResponse.json(
        { error: "Could not determine user ID." },
        { status: 400 }
      );
    }

    // Sanitize the inputs
    const sanitizedUserId = enforceUTF8(sanitizeForPostgres(userId));
    const sanitizedEmail = enforceUTF8(sanitizeForPostgres(email));
    
    console.log("Sanitized user data:", { 
      sanitizedUserId, 
      sanitizedEmail,
      originalUserIdLength: userId.length,
      sanitizedUserIdLength: sanitizedUserId.length,
      originalEmailLength: email.length,
      sanitizedEmailLength: sanitizedEmail.length
    });
    
    if (!sanitizedUserId) {
      return NextResponse.json(
        { error: "User ID is empty after sanitization." },
        { status: 400 }
      );
    }

    // Check if profile already exists
    try {
      const existingProfile = await prisma.profile.findUnique({
        where: { userId: sanitizedUserId },
      });

      if (existingProfile) {
        console.log(`Profile already exists for user: ${sanitizedUserId}`);
        return NextResponse.json({ message: "Profile already exists." });
      }
    } catch (findError) {
      console.error("Error checking for existing profile:", findError);
      // Continue with creation attempt
    }

    // Try creating with just the required fields first
    console.log(`Attempting to create profile for user: ${sanitizedUserId}`);
    try {
      await prisma.profile.create({
        data: {
          userId: sanitizedUserId,
          email: sanitizedEmail || "no-email@example.com", // Provide a default if empty
          subscriptionActive: false,
        },
      });

      console.log(`Profile created for user: ${sanitizedUserId}`);
      return NextResponse.json(
        { message: "Profile created successfully." },
        { status: 201 }
      );
    } catch (createError: any) {
      console.error("Detailed create error:", {
        message: createError.message,
        code: createError.code,
        meta: createError.meta,
      });
      
      return NextResponse.json(
        { 
          error: "Failed to create profile.", 
          details: createError.message
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Fatal error in create-profile API:", error);
    return NextResponse.json(
      { error: "Internal Server Error.", details: error.message },
      { status: 500 }
    );
  }
}