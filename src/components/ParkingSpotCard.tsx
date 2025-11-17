import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Car, Bike, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface Booking {
  id: string;
  date: string;
  duration: "morning" | "afternoon" | "full";
  vehicleType: "car" | "motorcycle";
  userName: string;
}

interface ParkingSpotCardProps {
  spotNumber: number;
  currentBookings: Booking[];
  onBook: () => void;
}

export const ParkingSpotCard = ({ spotNumber, currentBookings, onBook }: ParkingSpotCardProps) => {
  const today = new Date().toISOString().split('T')[0];
  const todayBookings = currentBookings.filter(b => b.date === today);
  
  const getAvailabilityStatus = () => {
    if (todayBookings.length === 0) return "available";
    
    const motorcycles = todayBookings.filter(b => b.vehicleType === "motorcycle");
    const cars = todayBookings.filter(b => b.vehicleType === "car");
    
    // Check if motorcycle limit reached
    const motorcyclesFull = motorcycles.length >= 4;
    
    // Check if car slots are full
    const hasCarFullDay = cars.some(b => b.duration === "full");
    const hasCarMorning = cars.some(b => b.duration === "morning");
    const hasCarAfternoon = cars.some(b => b.duration === "afternoon");
    const carsFull = hasCarFullDay || (hasCarMorning && hasCarAfternoon);
    
    // If both car and motorcycle spots are full, it's completely full
    if (motorcyclesFull && carsFull) return "full";
    
    // If car is booked for full day or both time slots, consider it fully booked
    // (even if motorcycles can still park)
    if (carsFull) return "full";
    
    // If motorcycles are at capacity but cars can still park
    if (motorcyclesFull) return "partial";
    
    // If there are some bookings but space available
    return "partial";
  };

  const status = getAvailabilityStatus();
  
  const statusConfig = {
    available: {
      badge: "Available",
      badgeClass: "bg-success text-success-foreground",
      cardClass: "border-success/50 hover:border-success transition-smooth"
    },
    partial: {
      badge: "Partially Booked",
      badgeClass: "bg-accent text-accent-foreground",
      cardClass: "border-accent/50 hover:border-accent transition-smooth"
    },
    full: {
      badge: "Fully Booked",
      badgeClass: "bg-destructive text-destructive-foreground",
      cardClass: "border-destructive/50"
    }
  };

  return (
    <Card className={cn(
      "glass-card transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 scale-in border-2",
      status === "available" && "border-green-200 hover:border-green-300 bg-white",
      status === "partial" && "border-blue-200 hover:border-blue-300 bg-white",
      status === "full" && "border-orange-200 hover:border-orange-300 bg-orange-50"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg font-semibold">
            <div className="flex gap-1">
              <Car className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
              <Bike className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
            </div>
            <span className="truncate">Parking Spot {spotNumber}</span>
          </CardTitle>
          <Badge className={cn(
            "whitespace-nowrap text-xs font-medium backdrop-blur-sm",
            status === "available" && "bg-green-500/90 text-white shadow-lg shadow-green-500/30",
            status === "partial" && "bg-blue-500/90 text-white shadow-lg shadow-blue-500/30",
            status === "full" && "bg-orange-500/90 text-white shadow-lg shadow-orange-500/30"
          )}>
            {statusConfig[status].badge}
          </Badge>
        </div>
        <CardDescription className="text-xs sm:text-sm font-medium text-muted-foreground">
          Cars & Motorcycles (Max 4 motorcycles)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4">
        {todayBookings.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs sm:text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
              Today's Bookings
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {todayBookings.map((booking) => (
                <div key={booking.id} className="flex items-center justify-between p-2 bg-gradient-to-r from-muted to-transparent rounded-md">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {booking.vehicleType === "car" ? (
                      <Car className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <Bike className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="text-xs sm:text-sm truncate">{booking.userName}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] sm:text-xs whitespace-nowrap ml-2">
                    {booking.duration === "full" ? "All Day" : 
                     booking.duration === "morning" ? "AM" : "PM"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-xs sm:text-sm text-muted-foreground">No bookings for today</p>
          </div>
        )}
        <Button 
          onClick={onBook} 
          className={cn(
            "w-full transition-all hover:scale-105 text-sm sm:text-base font-semibold shadow-lg text-white",
            status === "full" 
              ? "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-orange-500/50"
              : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-blue-500/50"
          )}
        >
          Book This Spot
        </Button>
      </CardContent>
    </Card>
  );
};
