/*
  OMO Paraguay Albirroja - Arduino Nano button bridge

  Arduino Nano clasico no puede emular teclado USB HID. Este sketch lee dos
  botones y envia eventos por Serial para que Python los convierta a WebSocket.

  Cableado recomendado con botones NC:
  - Boton izquierdo: pin D4 al terminal NC, COM a GND
  - Boton derecho: pin D5 al terminal NC, COM a GND
  - Usa INPUT_PULLUP interno, no hace falta resistencia externa

  Para botones NO, cambiar BUTTON_MODE_NC a false y cablear NO a pin, COM a GND.

  Eventos Serial:
  {"type":"button","side":"left","pressed":true,"source":"arduino","ms":1234}
  {"type":"button","side":"left","pressed":false,"source":"arduino","ms":1300}
*/

const int LEFT_BUTTON_PIN = 4;
const int RIGHT_BUTTON_PIN = 5;
const unsigned long DEBOUNCE_MS = 35;
const unsigned long SERIAL_BAUD = 115200;
const bool BUTTON_MODE_NC = true;

struct ButtonState {
  const char* side;
  int pin;
  int stableState;
  int lastReading;
  unsigned long lastChangeAt;
};

ButtonState leftButton = {"left", LEFT_BUTTON_PIN, HIGH, HIGH, 0};
ButtonState rightButton = {"right", RIGHT_BUTTON_PIN, HIGH, HIGH, 0};

bool isContactClosedToGround(int reading) {
  return reading == LOW;
}

bool isPressed(int reading) {
  const bool contactClosed = isContactClosedToGround(reading);
  return BUTTON_MODE_NC ? !contactClosed : contactClosed;
}

void sendButtonEvent(const char* side, bool pressed) {
  Serial.print("{\"type\":\"button\",\"side\":\"");
  Serial.print(side);
  Serial.print("\",\"pressed\":");
  Serial.print(pressed ? "true" : "false");
  Serial.print(",\"source\":\"arduino\",\"ms\":");
  Serial.print(millis());
  Serial.println("}");
}

void updateButton(ButtonState& button) {
  const int reading = digitalRead(button.pin);
  const unsigned long now = millis();

  if (reading != button.lastReading) {
    button.lastChangeAt = now;
    button.lastReading = reading;
  }

  if ((now - button.lastChangeAt) < DEBOUNCE_MS) {
    return;
  }

  if (reading == button.stableState) {
    return;
  }

  button.stableState = reading;
  sendButtonEvent(button.side, isPressed(reading));
}

void initButton(ButtonState& button) {
  const int reading = digitalRead(button.pin);
  button.stableState = reading;
  button.lastReading = reading;
  button.lastChangeAt = millis();
}

void setup() {
  pinMode(LEFT_BUTTON_PIN, INPUT_PULLUP);
  pinMode(RIGHT_BUTTON_PIN, INPUT_PULLUP);

  Serial.begin(SERIAL_BAUD);
  const unsigned long startAt = millis();
  while (!Serial && (millis() - startAt < 1500)) {
    delay(10);
  }

  Serial.print("{\"type\":\"ready\",\"source\":\"arduino\",\"name\":\"omo-nano-buttons\",\"buttonMode\":\"");
  Serial.print(BUTTON_MODE_NC ? "NC" : "NO");
  Serial.println("\"}");
  initButton(leftButton);
  initButton(rightButton);
}

void loop() {
  updateButton(leftButton);
  updateButton(rightButton);
  delay(2);
}
