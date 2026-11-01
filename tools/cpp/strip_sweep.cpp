// Strip sweep for one polyomino: the C++ twin of src/core/strip.ts, for large state counts.
//
// Column sweep along one wall of a rectangle, starting at its left wall. The state is the
// occupancy of the first h rows ("the band") in the next `reach` columns, plus min(column, reach)
// for the left wall. Each step completes the band cells of the current column, lowest empty
// cell first.
//   strict (hard wall at row h): exact. Reaching the empty state again = an h x W rectangle.
//   band (no wall at row h):     cells above the band are ignored (a relaxation). If the empty
//                                state is unreachable, no rectangle of height >= h exists.
// For h = minSide.. maxHeight: strict(h), then band(h). band(h) unreachable after every smaller
// height was excluded proves the piece tiles no rectangle.
//
// Build: g++ -O2 -std=c++20 -o tools/cpp/strip_sweep.exe tools/cpp/strip_sweep.cpp
// Usage: strip_sweep --id <hex id> [--max-height H] [--max-states N] [--out file.json]

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <stdexcept>
#include <string>
#include <vector>

using Key = unsigned __int128;
static const Key EMPTY_SLOT = ~(Key)0;

struct Cell {
    int x, y;
};

struct Anchored {
    std::vector<Cell> offsets;  // relative to the anchor cell
};

static std::vector<Cell> normalize(std::vector<Cell> cells) {
    int minX = 1 << 30, minY = 1 << 30;
    for (const Cell& c : cells) {
        minX = std::min(minX, c.x);
        minY = std::min(minY, c.y);
    }
    for (Cell& c : cells) {
        c.x -= minX;
        c.y -= minY;
    }
    std::sort(cells.begin(), cells.end(), [](const Cell& a, const Cell& b) { return a.y != b.y ? a.y < b.y : a.x < b.x; });
    return cells;
}

// Same orientation convention as the site: rotate clockwise k%4 quarter turns, mirror if k >= 4.
static std::vector<Cell> orient(const std::vector<Cell>& base, int k) {
    std::vector<Cell> out;
    for (Cell c : base) {
        int x = c.x, y = c.y;
        for (int t = 0; t < k % 4; t++) {
            int nx = -y, ny = x;
            x = nx;
            y = ny;
        }
        if (k >= 4) x = -x;
        out.push_back({x, y});
    }
    return normalize(out);
}

static std::vector<Cell> decodeId(const std::string& id) {
    std::vector<std::string> rows;
    if (!id.empty() && id[0] == 'x') {
        size_t start = 1;
        while (start <= id.size()) {
            size_t dot = id.find('.', start);
            if (dot == std::string::npos) dot = id.size();
            rows.push_back(id.substr(start, dot - start));
            start = dot + 1;
        }
    } else {
        if (id.size() % 2 != 0) throw std::runtime_error("malformed id");
        for (size_t i = 0; i < id.size(); i += 2) rows.push_back(id.substr(i, 2));
    }
    std::vector<Cell> cells;
    for (size_t y = 0; y < rows.size(); y++) {
        const std::string& row = rows[y];
        for (size_t d = 0; d < row.size(); d++) {
            int nibble = std::stoi(row.substr(d, 1), nullptr, 16);
            for (int b = 0; b < 4; b++)
                if (nibble & (8 >> b)) cells.push_back({(int)(d * 4 + b), (int)y});
        }
    }
    if (cells.empty()) throw std::runtime_error("empty id");
    return normalize(cells);
}

class StateSet {
public:
    explicit StateSet(uint64_t capacityPowerOfTwo) : mask_(capacityPowerOfTwo - 1), slots_(capacityPowerOfTwo, EMPTY_SLOT) {}
    // Returns true if newly inserted.
    bool insert(Key key) {
        uint64_t h = hash(key) & mask_;
        while (true) {
            if (slots_[h] == EMPTY_SLOT) {
                slots_[h] = key;
                size_++;
                return true;
            }
            if (slots_[h] == key) return false;
            h = (h + 1) & mask_;
        }
    }
    uint64_t size() const { return size_; }

private:
    static uint64_t hash(Key key) {
        uint64_t a = (uint64_t)key, b = (uint64_t)(key >> 64);
        uint64_t z = a ^ (b * 0x9E3779B97F4A7C15ULL);
        z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
        z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
        return z ^ (z >> 31);
    }
    uint64_t mask_;
    std::vector<Key> slots_;
    uint64_t size_ = 0;
};

enum class Verdict { Unreachable, Reachable, Limit };

struct SweepResult {
    Verdict verdict;
    uint64_t states;
    int width;  // for Reachable
};

class Sweeper {
public:
    Sweeper(const std::vector<Cell>& base, int height, bool strict, uint64_t maxStates)
        : height_(height), strict_(strict), maxStates_(maxStates) {
        int w = 0, h = 0;
        for (const Cell& c : base) {
            w = std::max(w, c.x + 1);
            h = std::max(h, c.y + 1);
        }
        reach_ = std::max(w, h);
        if (reach_ > 15) throw std::runtime_error("pieces longer than 15 cells do not fit the column tag");
        if (height_ * reach_ + 4 > 128) throw std::runtime_error("state does not fit in 128 bits; lower --max-height");
        full_ = (height_ == 32) ? 0xFFFFFFFFu : ((1u << height_) - 1);
        std::vector<std::vector<Cell>> seen;
        for (int k = 0; k < 8; k++) {
            std::vector<Cell> shape = orient(base, k);
            bool duplicate = false;
            for (const auto& s : seen)
                if (s.size() == shape.size() && std::equal(s.begin(), s.end(), shape.begin(), [](const Cell& a, const Cell& b) { return a.x == b.x && a.y == b.y; }))
                    duplicate = true;
            if (duplicate) continue;
            seen.push_back(shape);
            for (const Cell& anchor : shape) {
                Anchored a;
                for (const Cell& c : shape) a.offsets.push_back({c.x - anchor.x, c.y - anchor.y});
                shapes_.push_back(a);
            }
        }
    }

    SweepResult run() {
        uint64_t capacity = 1;
        while (capacity < maxStates_ * 2) capacity <<= 1;
        StateSet set(capacity);
        std::vector<uint32_t> start(reach_, 0);
        Key startKey = pack(start, 0);
        set.insert(startKey);
        // Breadth-first by column, so a reported width is the smallest one.
        std::vector<Key> frontier{startKey}, next;
        std::vector<uint32_t> masks(reach_);
        for (int column = 0; !frontier.empty(); column++) {
            next.clear();
            for (Key key : frontier) {
                unpack(key, masks);
                int tag = (int)(key & 15);
                bool found = false, limit = false;
                fill(masks, tag, [&](const std::vector<uint32_t>& done) {
                    if (found || limit) return;
                    std::vector<uint32_t> shifted(reach_, 0);
                    for (int i = 1; i < reach_; i++) shifted[i - 1] = done[i];
                    Key nextKey = pack(shifted, std::min(tag + 1, reach_));
                    if (!set.insert(nextKey)) return;
                    if (set.size() >= maxStates_) { limit = true; return; }
                    if (std::all_of(shifted.begin(), shifted.end(), [](uint32_t m) { return m == 0; })) { found = true; return; }
                    next.push_back(nextKey);
                });
                if (found) return {Verdict::Reachable, set.size(), column + 1};
                if (limit) return {Verdict::Limit, set.size(), 0};
            }
            std::swap(frontier, next);
        }
        return {Verdict::Unreachable, set.size(), 0};
    }

private:
    Key pack(const std::vector<uint32_t>& masks, int tag) const {
        Key key = (Key)tag;
        for (int i = 0; i < reach_; i++) key |= (Key)masks[i] << (4 + i * height_);
        return key;
    }
    void unpack(Key key, std::vector<uint32_t>& masks) const {
        for (int i = 0; i < reach_; i++) masks[i] = (uint32_t)((key >> (4 + i * height_)) & full_);
    }

    template <typename Emit>
    void fill(std::vector<uint32_t>& state, int column, Emit&& emit) {
        uint32_t current = state[0];
        if (current == full_) {
            emit(state);
            return;
        }
        int y = 0;
        while ((current >> y) & 1u) y++;
        for (const Anchored& shape : shapes_) {
            bool ok = true;
            for (const Cell& o : shape.offsets) {
                int rel = o.x, row = y + o.y;
                if (row < 0 || column + rel < 0) { ok = false; break; }
                if (row >= height_) { if (strict_) { ok = false; break; } continue; }
                if (rel < 0 || ((state[rel] >> row) & 1u)) { ok = false; break; }
            }
            if (!ok) continue;
            std::vector<uint32_t> after = state;
            for (const Cell& o : shape.offsets) {
                int row = y + o.y;
                if (row < height_) after[o.x] |= 1u << row;
            }
            fill(after, column, emit);
        }
    }

    int height_;
    bool strict_;
    uint64_t maxStates_;
    int reach_ = 0;
    uint32_t full_ = 0;
    std::vector<Anchored> shapes_;
};

static const char* name(Verdict v) {
    switch (v) {
        case Verdict::Unreachable: return "unreachable";
        case Verdict::Reachable: return "reachable";
        default: return "limit";
    }
}

int main(int argc, char** argv) {
    std::string id, out;
    int maxHeight = 24;
    uint64_t maxStates = 100000000;
    for (int i = 1; i < argc; i++) {
        std::string a = argv[i];
        auto next = [&]() -> std::string {
            if (i + 1 >= argc) throw std::runtime_error("missing value for " + a);
            return argv[++i];
        };
        if (a == "--help" || a == "-h") {
            std::puts("Usage: strip_sweep --id <hex id> [--max-height H (24)] [--max-states N (100000000)] [--out file.json]\n"
                      "Strict and band sweeps for heights minSide..H; stops at the first proof or rectangle.");
            return 0;
        } else if (a == "--id") id = next();
        else if (a == "--max-height") maxHeight = std::stoi(next());
        else if (a == "--max-states") maxStates = std::stoull(next());
        else if (a == "--out") out = next();
        else throw std::runtime_error("unknown argument " + a);
    }
    if (id.empty()) throw std::runtime_error("--id is required");
    std::vector<Cell> base = decodeId(id);
    int w = 0, h = 0;
    for (const Cell& c : base) { w = std::max(w, c.x + 1); h = std::max(h, c.y + 1); }
    int minSide = std::min(w, h);

    std::string conclusion = "undecided";
    std::string log;
    for (int height = minSide; height <= maxHeight; height++) {
        for (bool strict : {true, false}) {
            auto t0 = std::chrono::steady_clock::now();
            Sweeper sweeper(base, height, strict, maxStates);
            SweepResult r = sweeper.run();
            double seconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
            char line[256];
            std::snprintf(line, sizeof line, "{\"height\": %d, \"mode\": \"%s\", \"verdict\": \"%s\", \"states\": %llu, \"width\": %d, \"seconds\": %.1f}",
                          height, strict ? "strict" : "band", name(r.verdict), (unsigned long long)r.states, r.width, seconds);
            std::printf("%s %s\n", id.c_str(), line);
            std::fflush(stdout);
            log += (log.empty() ? "" : ",\n    ") + std::string(line);
            if (strict && r.verdict == Verdict::Reachable) {
                conclusion = "rectangle " + std::to_string(r.width) + "x" + std::to_string(height);
                goto done;
            }
            if (!strict && r.verdict == Verdict::Unreachable) {
                conclusion = "no-rectangle band " + std::to_string(height);
                goto done;
            }
        }
    }
done:
    std::printf("%s conclusion: %s\n", id.c_str(), conclusion.c_str());
    if (!out.empty()) {
        std::ofstream f(out);
        f << "{\n  \"id\": \"" << id << "\",\n  \"maxHeight\": " << maxHeight << ",\n  \"maxStates\": " << maxStates
          << ",\n  \"conclusion\": \"" << conclusion << "\",\n  \"runs\": [\n    " << log << "\n  ]\n}\n";
    }
    return 0;
}
