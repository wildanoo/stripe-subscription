import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// mongodb
// wildanoo 
// JcyqfCKuX3z37oQC

//mongodb+srv://wildanoo:JcyqfCKuX3z37oQC@cluster0.y0kms.mongodb.net/stripe_db?retryWrites=true&w=majority&appName=Cluster0