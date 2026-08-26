## Booking lifecycle additions

Add explicit definitions for the statuses and payment/refund terms introduced in docs/booking-workflow.md.

| Term | Definition |
|---|---|
| **reserved** | The pre-confirmation booking state. Customers may create additional `reserved` bookings for the same date/resource while a `reserved` booking exists. A `reserved` booking contributes to the CalendarState `reserved`. |
| **booked** | The final confirmed booking state. Reached when two distinct Admins `approve` the booking. A `booked` booking blocks the slot so no other booking can be confirmed for that same resource/date-range. |
| **declined** | Booking state when an Admin explicitly declines a booking, or when it is auto-declined because another overlapping booking became `booked`. |
| **payment_stage** | Field describing recorded payment progress: `unpaid` \| `advance_paid` \| `fully_paid` \| `refunded`. Admins record payment info manually; external payment webhooks may also update these values. |
| **email_notification** | Outbound emails sent to customers or admins for booking events (booked, declined, refund). Templates are customizable and logged. |
| **refund_task** | Internal record created when a paid `reserved` booking is auto-declined; used by admins to process refunds. |

