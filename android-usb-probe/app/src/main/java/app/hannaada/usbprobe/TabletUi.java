package app.hannaada.usbprobe;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Lightweight Android 5-native, offline tablet UI. No WebView, network, or image assets. */
final class TabletUi {
    static final int BG = Color.rgb(9, 15, 27);
    static final int PANEL = Color.rgb(20, 31, 49);
    static final int PANEL_ALT = Color.rgb(25, 40, 62);
    static final int OUTLINE = Color.rgb(47, 65, 91);
    static final int WHITE = Color.rgb(242, 247, 255);
    static final int MUTED = Color.rgb(168, 183, 204);
    static final int BLUE = Color.rgb(77, 166, 255);
    static final int RED = Color.rgb(251, 104, 113);
    static final int GREEN = Color.rgb(123, 226, 180);
    static final int AMBER = Color.rgb(255, 193, 111);

    private final Context context;
    private final boolean wide;

    TabletUi(Context context) {
        this.context = context;
        float dpWidth = context.getResources().getDisplayMetrics().widthPixels
                / context.getResources().getDisplayMetrics().density;
        wide = dpWidth >= 600;
    }

    int dp(int size) {
        return (int) (size * context.getResources().getDisplayMetrics().density + 0.5f);
    }

    boolean isWide() {
        return wide;
    }

    LinearLayout column() {
        LinearLayout view = new LinearLayout(context);
        view.setOrientation(LinearLayout.VERTICAL);
        return view;
    }

    LinearLayout row() {
        LinearLayout view = new LinearLayout(context);
        view.setOrientation(LinearLayout.HORIZONTAL);
        view.setGravity(Gravity.CENTER_VERTICAL);
        return view;
    }

    GradientDrawable background(int fill, int stroke, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(dp(radius));
        if (stroke != 0) drawable.setStroke(dp(1), stroke);
        return drawable;
    }

    TextView text(String value, int sp, int color, boolean bold) {
        TextView label = new TextView(context);
        label.setText(value);
        label.setTextSize(sp);
        label.setTextColor(color);
        if (bold) label.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        label.setLineSpacing(dp(3), 1f);
        return label;
    }

    void gap(LinearLayout parent, int height) {
        View spacer = new View(context);
        parent.addView(spacer, new LinearLayout.LayoutParams(1, dp(height)));
    }

    LinearLayout.LayoutParams margins(int width, int height, int top) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(width, height);
        params.topMargin = dp(top);
        return params;
    }

    LinearLayout card() {
        LinearLayout card = column();
        card.setPadding(dp(wide ? 22 : 17), dp(18), dp(wide ? 22 : 17), dp(18));
        card.setBackground(background(PANEL, OUTLINE, 22));
        return card;
    }

    private LinearLayout icon(String kind, int tint, int size) {
        LinearLayout frame = row();
        frame.setGravity(Gravity.CENTER);
        frame.setBackground(background(Color.argb(38, Color.red(tint), Color.green(tint), Color.blue(tint)), 0, 17));
        frame.addView(new Icon(context, kind, tint), new LinearLayout.LayoutParams(dp(size - 13), dp(size - 13)));
        frame.setContentDescription(kind);
        return frame;
    }

    void header(LinearLayout root) {
        LinearLayout top = row();
        top.addView(icon("gauge", BLUE, 60), new LinearLayout.LayoutParams(dp(60), dp(60)));
        LinearLayout names = column();
        LinearLayout.LayoutParams nameParams = new LinearLayout.LayoutParams(0, -2, 1);
        nameParams.leftMargin = dp(14);
        top.addView(names, nameParams);
        names.addView(text("HANNA & ADA", wide ? 27 : 23, WHITE, true));
        names.addView(text("USB LAB  /  ANDROID 5", 13, BLUE, true));
        TextView offline = text("OFFLINE", 12, GREEN, true);
        offline.setGravity(Gravity.CENTER);
        offline.setPadding(dp(9), dp(10), dp(9), dp(10));
        offline.setBackground(background(Color.rgb(26, 60, 53), 0, 13));
        top.addView(offline);
        root.addView(top);
        gap(root, 18);
    }

    void hero(LinearLayout root, String title, String summary, int color, String marker) {
        LinearLayout hero = column();
        hero.setPadding(dp(wide ? 25 : 19), dp(22), dp(wide ? 25 : 19), dp(22));
        GradientDrawable drawable = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{Color.rgb(31, 56, 89), Color.rgb(18, 29, 50)});
        drawable.setCornerRadius(dp(24));
        drawable.setStroke(dp(1), Color.rgb(62, 89, 131));
        hero.setBackground(drawable);
        LinearLayout top = row();
        top.addView(icon("plug", color, 62), new LinearLayout.LayoutParams(dp(62), dp(62)));
        LinearLayout headline = column();
        LinearLayout.LayoutParams titleSpace = new LinearLayout.LayoutParams(0, -2, 1);
        titleSpace.leftMargin = dp(15);
        top.addView(headline, titleSpace);
        headline.addView(text("STATUS POŁĄCZENIA USB", 12, BLUE, true));
        headline.addView(text(title, wide ? 27 : 23, WHITE, true));
        hero.addView(top);
        gap(hero, 14);
        hero.addView(text(summary, 16, MUTED, false));
        gap(hero, 14);
        TextView chip = text(marker, 13, color, true);
        chip.setPadding(dp(13), dp(9), dp(13), dp(9));
        chip.setBackground(background(Color.rgb(13, 27, 45), 0, 14));
        hero.addView(chip);
        root.addView(hero);
        gap(root, 22);
    }

    void sectionTitle(LinearLayout root, String value) {
        root.addView(text(value, 17, WHITE, true));
        gap(root, 10);
    }

    LinearLayout metric(String kind, String title, String value, String detail, int tint) {
        LinearLayout card = card();
        LinearLayout top = row();
        top.addView(icon(kind, tint, 55), new LinearLayout.LayoutParams(dp(55), dp(55)));
        LinearLayout info = column();
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, -2, 1);
        params.leftMargin = dp(12);
        top.addView(info, params);
        info.addView(text(title, 14, MUTED, true));
        info.addView(text(value, wide ? 22 : 20, tint, true));
        card.addView(top);
        gap(card, 10);
        card.addView(text(detail, 14, MUTED, false));
        return card;
    }

    void metrics(LinearLayout root, LinearLayout left, LinearLayout right) {
        if (wide) {
            LinearLayout grid = row();
            LinearLayout.LayoutParams a = new LinearLayout.LayoutParams(0, -1, 1);
            a.rightMargin = dp(7);
            grid.addView(left, a);
            LinearLayout.LayoutParams b = new LinearLayout.LayoutParams(0, -1, 1);
            b.leftMargin = dp(7);
            grid.addView(right, b);
            root.addView(grid);
        } else {
            root.addView(left, new LinearLayout.LayoutParams(-1, -2));
            gap(root, 12);
            root.addView(right, new LinearLayout.LayoutParams(-1, -2));
        }
        gap(root, 17);
    }

    void detail(LinearLayout card, String title, String value, int valueColor) {
        LinearLayout line = row();
        line.addView(text(title, 15, MUTED, false), new LinearLayout.LayoutParams(0, -2, 1));
        TextView result = text(value, 15, valueColor, true);
        result.setGravity(Gravity.END);
        line.addView(result);
        card.addView(line);
        gap(card, 9);
    }

    void button(LinearLayout root, String title, String symbol, boolean primary, View.OnClickListener callback) {
        Button button = new Button(context);
        button.setText(symbol + "   " + title);
        button.setTextSize(wide ? 18 : 16);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setAllCaps(false);
        button.setTextColor(primary ? BG : WHITE);
        button.setGravity(Gravity.CENTER);
        button.setMinHeight(dp(64));
        button.setBackground(background(primary ? BLUE : PANEL_ALT, primary ? 0 : OUTLINE, 17));
        button.setOnClickListener(callback);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(64));
        params.bottomMargin = dp(11);
        root.addView(button, params);
    }

    void note(LinearLayout root, String value) {
        TextView note = text(value, 14, MUTED, false);
        note.setPadding(dp(13), dp(13), dp(13), dp(13));
        note.setBackground(background(Color.rgb(16, 26, 43), OUTLINE, 14));
        root.addView(note);
    }

    /** Local canvas vectors ensure readable icons even with Android 5 fonts and no icon packs. */
    private static final class Icon extends View {
        private final String kind;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final int tint;
        Icon(Context context, String kind, int tint) {
            super(context);
            this.kind = kind;
            this.tint = tint;
            setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        }
        private void line(Canvas canvas, float x1, float y1, float x2, float y2) {
            canvas.drawLine(x1, y1, x2, y2, paint);
        }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            canvas.save();
            canvas.scale(getWidth() / 48f, getHeight() / 48f);
            paint.setColor(tint);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(3.2f);
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStrokeJoin(Paint.Join.ROUND);
            if ("plug".equals(kind)) {
                canvas.drawRoundRect(new RectF(10, 17, 38, 34), 5, 5, paint);
                line(canvas, 17, 17, 17, 11); line(canvas, 31, 17, 31, 11);
                line(canvas, 24, 34, 24, 40);
            } else if ("shield".equals(kind)) {
                android.graphics.Path path = new android.graphics.Path();
                path.moveTo(24, 7); path.lineTo(39, 13); path.lineTo(37, 29);
                path.quadTo(33, 38, 24, 42); path.quadTo(15, 38, 11, 29);
                path.lineTo(9, 13); path.close(); canvas.drawPath(path, paint);
                line(canvas, 17, 25, 22, 30); line(canvas, 22, 30, 31, 20);
            } else if ("chip".equals(kind)) {
                canvas.drawRoundRect(new RectF(12, 12, 36, 36), 4, 4, paint);
                for (int n = 18; n <= 30; n += 12) {
                    line(canvas, n, 7, n, 12); line(canvas, n, 36, n, 41);
                    line(canvas, 7, n, 12, n); line(canvas, 36, n, 41, n);
                }
                canvas.drawRect(19, 19, 29, 29, paint);
            } else if ("gauge".equals(kind)) {
                canvas.drawArc(new RectF(8, 8, 40, 40), 160, 220, false, paint);
                line(canvas, 24, 26, 33, 17);
                canvas.drawCircle(24, 26, 3, paint);
            } else {
                canvas.drawRoundRect(new RectF(10, 12, 38, 36), 4, 4, paint);
                line(canvas, 17, 24, 31, 24);
            }
            canvas.restore();
        }
    }
}
