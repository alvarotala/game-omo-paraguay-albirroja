#!/usr/bin/env python3
import time

from gpiozero import DigitalInputDevice

LEFT_PIN = 17
RIGHT_PIN = 27
PULL_UP = True  # True = internal pull-up, NO button connects GPIO to GND when pressed

left = DigitalInputDevice(LEFT_PIN, pull_up=PULL_UP)
right = DigitalInputDevice(RIGHT_PIN, pull_up=PULL_UP)

print("Reading GPIO BCM17 and BCM27. Press Ctrl+C to stop.")
print("Expected wiring with PULL_UP=True: button is NO, connects GPIO pin to GND when pressed.")


def signal_label(device):
    is_high = not bool(device.value) if PULL_UP else bool(device.value)
    return "HIGH" if is_high else "LOW"

try:
    while True:
        left_state = signal_label(left)
        right_state = signal_label(right)
        print(f"GPIO17={left_state} GPIO27={right_state}", flush=True)
        time.sleep(0.2)
except KeyboardInterrupt:
    print("\nStopped.")
