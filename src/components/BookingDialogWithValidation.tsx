import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Car, Bike } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Type guards for runtime validation
const isDuration = (value: unknown): value is "morning" | "afternoon" | "full" => {
  return value === "morning" || value === "afternoon" || value === "full";
};

const isVehicleType = (value: unknown): value is "car" | "motorcycle" => {
  return value === "car" || value === "motorcycle";
};

interface Booking {
  id: string;
  date: string;
  duration: "morning" | "afternoon" | "full";
  vehicleType: "car" | "motorcycle";
  userName: string;
  spotNumber: number;
}

interface BookingDialogWithValidationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spotNumber: number;
  onConfirm: (booking: {
    date: string;
    duration: "morning" | "afternoon" | "full";
    vehicleType: "car" | "motorcycle";
    spotNumber: number;
  }) => void;
}

export const BookingDialogWithValidation = ({ 
  open, 
  onOpenChange, 
  spotNumber, 
  onConfirm 
}: BookingDialogWithValidationProps) => {
  const { user } = useAuth();
  const [date, setDate] = useState<Date>();
  const [duration, setDuration] = useState<"morning" | "afternoon" | "full">("full");
  const [vehicleType, setVehicleType] = useState<"car" | "motorcycle">("car");
  const [isValidating, setIsValidating] = useState(false);

  const handleSubmit = async () => {
    if (!date) {
      toast.error("Please select a date");
      return;
    }

    if (!user) {
      toast.error("You must be logged in to book");
      return;
    }

    setIsValidating(true);
    const selectedDateStr = format(date, "yyyy-MM-dd");
    const userName = user.user_metadata?.user_name || user.email;

    try {
      // First, check if user already has a booking on this date
      const { data: userBookings, error: userError } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_name', userName)
        .eq('date', selectedDateStr);

      if (userError) throw userError;

      if (userBookings && userBookings.length > 0) {
        const existingBooking = userBookings[0];
        toast.error(`You already have a booking on this date (Spot ${existingBooking.spot_number}, ${existingBooking.vehicle_type === 'car' ? '🚗 Car' : '🏍️ Motorcycle'})`);
        setIsValidating(false);
        return;
      }

      // Fetch ALL bookings for this spot and date to validate conflicts
      const { data: existingBookings, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('spot_number', spotNumber)
        .eq('date', selectedDateStr);

      if (error) throw error;

      const bookingsForDate = existingBookings || [];

      // Overlap helper
      const overlaps = (a: "morning" | "afternoon" | "full", b: "morning" | "afternoon" | "full") => {
        if (a === "full" || b === "full") return true;
        return a === b;
      };

      // Validation for car booking: must not overlap with any car or motorcycle
      if (vehicleType === "car") {
        const conflict = bookingsForDate.some(b => {
          if (!isDuration(b.duration)) {
            console.error('Invalid duration in booking:', b.duration);
            return false;
          }
          return overlaps(duration, b.duration);
        });
        if (conflict) {
          toast.error("This spot already has a booking at that time");
          setIsValidating(false);
          return;
        }
      }

      // Validation for motorcycle booking: must not overlap with cars and max 4 overlapping motorcycles
      if (vehicleType === "motorcycle") {
        const carConflict = bookingsForDate.some(b => {
          if (!isDuration(b.duration) || !isVehicleType(b.vehicle_type)) {
            console.error('Invalid booking data:', b);
            return false;
          }
          return b.vehicle_type === "car" && overlaps(duration, b.duration);
        });
        if (carConflict) {
          toast.error("A car is booked for that time on this spot");
          setIsValidating(false);
          return;
        }

        const overlappingMotoCount = bookingsForDate.filter(b => {
          if (!isDuration(b.duration) || !isVehicleType(b.vehicle_type)) {
            console.error('Invalid booking data:', b);
            return false;
          }
          return b.vehicle_type === "motorcycle" && overlaps(duration, b.duration);
        }).length;

        if (overlappingMotoCount >= 4) {
          toast.error("Maximum 4 motorcycles allowed at the same time on this spot");
          setIsValidating(false);
          return;
        }
      }

      // All validation passed
      onConfirm({
        date: selectedDateStr,
        duration,
        vehicleType,
        spotNumber,
      });

      // Reset form
      setDate(undefined);
      setDuration("full");
      setVehicleType("car");
      onOpenChange(false);
    } catch (error) {
      console.error('Error validating booking:', error);
      toast.error('Failed to validate booking. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Book Parking Spot {spotNumber}</DialogTitle>
          <DialogDescription>
            Fill in the details to reserve your parking spot. You can only have one booking per day.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>Select Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Vehicle Type</Label>
            <RadioGroup value={vehicleType} onValueChange={(v) => setVehicleType(v as "car" | "motorcycle")}>
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted transition-smooth cursor-pointer">
                <RadioGroupItem value="car" id="car" />
                <Label htmlFor="car" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Car className="h-5 w-5 text-primary" />
                  <span>Car</span>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted transition-smooth cursor-pointer">
                <RadioGroupItem value="motorcycle" id="motorcycle" />
                <Label htmlFor="motorcycle" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Bike className="h-5 w-5 text-primary" />
                  <span>Motorcycle</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Duration</Label>
            <RadioGroup value={duration} onValueChange={(v) => setDuration(v as "morning" | "afternoon" | "full")}>
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted transition-smooth cursor-pointer">
                <RadioGroupItem value="full" id="full" />
                <Label htmlFor="full" className="cursor-pointer flex-1">Full Day</Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted transition-smooth cursor-pointer">
                <RadioGroupItem value="morning" id="morning" />
                <Label htmlFor="morning" className="cursor-pointer flex-1">Morning (Half Day)</Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted transition-smooth cursor-pointer">
                <RadioGroupItem value="afternoon" id="afternoon" />
                <Label htmlFor="afternoon" className="cursor-pointer flex-1">Afternoon (Half Day)</Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={isValidating}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="flex-1 bg-gradient-primary" disabled={isValidating}>
            {isValidating ? "Validating..." : "Confirm Booking"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
