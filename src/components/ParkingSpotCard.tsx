import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Car, Bike, Calendar, Sparkles } from "lucide-react";
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

  return (
    <Card className={cn(
      "glass-card hover-lift border-2 animate-fade-in-up relative overflow-hidden",
      status === "available" && "border-success/30 hover:border-success/50",
      status === "partial" && "border-info/30 hover:border-info/50",
      status === "full" && "border-warning/30 hover:border-warning/50 bg-warning/5"
    )}>
      {/* Decorative corner gradient */}
      <div className={cn(
        "absolute top-0 right-0 w-24 h-24 opacity-20 blur-2xl",
        status === "available" && "bg-success",
        status === "partial" && "bg-info",
        status === "full" && "bg-warning"
      )} />
      
      <CardHeader className="pb-3 relative">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg font-semibold">
            <div className={cn(
              "flex gap-1 p-1.5 rounded-lg",
              status === "available" && "bg-success/10",
              status === "partial" && "bg-info/10",
              status === "full" && "bg-warning/10"
            )}>
              <Car className={cn(
                "h-4 w-4 sm:h-5 sm:w-5",
                status === "available" && "text-success",
                status === "partial" && "text-info",
                status === "full" && "text-warning"
              )} />
              <Bike className={cn(
                "h-4 w-4 sm:h-5 sm:w-5",
                status === "available" && "text-success",
                status === "partial" && "text-info",
                status === "full" && "text-warning"
              )} />
            </div>
            <span className="truncate">Spot {spotNumber}</span>
          </CardTitle>
          <Badge className={cn(
            "whitespace-nowrap text-xs font-semibold shadow-lg",
            status === "available" && "bg-success text-white shadow-success/30",
            status === "partial" && "bg-info text-white shadow-info/30",
            status === "full" && "bg-warning text-white shadow-warning/30"
          )}>
            {status === "available" && "✓ Available"}
            {status === "partial" && "◐ Partial"}
            {status === "full" && "✕ Full"}
          </Badge>
        </div>
        <CardDescription className="text-xs sm:text-sm font-medium text-muted-foreground">
          Cars & Motorcycles (Max 4 motorcycles)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 relative">
        {todayBookings.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs sm:text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
              Today's Bookings ({todayBookings.length})
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {todayBookings.map((booking, index) => (
                <div 
                  key={booking.id} 
                  className="relative p-2 bg-muted/50 rounded-lg border border-border/50 animate-fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <Badge variant="outline" className={cn(
                    "absolute top-1 right-1 text-[10px] sm:text-xs whitespace-nowrap font-medium",
                    booking.duration === "full" && "border-primary/50 bg-primary/10 text-primary",
                    booking.duration === "morning" && "border-info/50 bg-info/10 text-info",
                    booking.duration === "afternoon" && "border-warning/50 bg-warning/10 text-warning"
                  )}>
                    {booking.duration === "full" ? "All Day" : 
                     booking.duration === "morning" ? "AM" : "PM"}
                  </Badge>
                  <div className="flex items-center gap-2 min-w-0 pr-12">
                    {booking.vehicleType === "car" ? (
                      <Car className="h-3 w-3 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
                    ) : (
                      <Bike className="h-3 w-3 sm:h-4 sm:w-4 text-accent flex-shrink-0" />
                    )}
                    <span className="text-xs sm:text-sm truncate font-medium">{booking.userName}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <Sparkles className="h-8 w-8 mx-auto text-success/50 mb-2" />
            <p className="text-sm text-muted-foreground font-medium">Available all day!</p>
          </div>
        )}
        <Button 
          onClick={onBook} 
          className={cn(
            "w-full transition-all duration-300 hover:scale-[1.02] text-sm sm:text-base font-semibold shadow-lg text-white",
            status === "full" 
              ? "gradient-warning shadow-warning/30 hover:shadow-warning/50"
              : "gradient-primary shadow-primary/30 hover:shadow-primary/50"
          )}
        >
          {status === "full" ? "View Options" : "Book This Spot"}
        </Button>
      </CardContent>
    </Card>
  );
};
