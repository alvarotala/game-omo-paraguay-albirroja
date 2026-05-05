#!/usr/bin/env python3
import time

from gpiozero import DigitalInputDevice

LEFT_PIN = 17
RIGHT_PIN = 27
PULL_UP = False  # False = internal pull-down, button should send HIGH when pressed

left = DigitalInputDevice(LEFT_PIN, pull_up=PULL_UP)
right = DigitalInputDevice(RIGHT_PIN, pull_up=PULL_UP)

print("Reading GPIO BCM17 and BCM27. Press Ctrl+C to stop.")
print("Expected wiring with PULL_UP=False: button connects GPIO pin to 3.3V when pressed.")

try:
    while True:
        left_state = "HIGH" if left.value else "LOW"
        right_state = "HIGH" if right.value else "LOW"
        print(f"GPIO17={left_state} GPIO27={right_state}", flush=True)
        time.sleep(0.2)
except KeyboardInterrupt:
    print("\nStopped.")
