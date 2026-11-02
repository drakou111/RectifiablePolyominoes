// Finds one tiling of a W x H rectangle by copies of a polyomino.
//
// Fills cells in column-major order (down each column of height H, then the next column), always
// covering the first empty cell. Everything before that cell is full, and no placed copy reaches
// more than `reach` columns past it, so the state is (position, occupancy of the next reach*H
// cells). States that led nowhere are remembered in a bounded cache and skipped when met again.
// That turns the search into a sweep over frontier states, which suits long rectangles with a
// short side H. A move is also rejected when it leaves an empty pocket smaller than
// min(P, copy size) cells; P = 2 (single holes) solved the most per second in tests. The cache
// compares whole states and only forgets entries, so "exhausted" means no tiling exists.
//
// Build: g++ -O3 -std=c++20 -o tools/cpp/bin/rect_tiler tools/cpp/rect_tiler.cpp
// Usage: rect_tiler --width W --height H --orientations "x,y x,y ...|x,y ...|..."
//                   [--budget NODES] [--cache-mb M] [--seed S] [--pocket-limit P]
// Each orientation is a normalized cell list; output placements use their index in this list.
// Output (one JSON line): {"result":"found","nodes":N,"placements":[[o,x,y],...]}
//                     or  {"result":"budget"|"exhausted","nodes":N}

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <random>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

struct Cell {
    int x;
    int y;
};

struct Options {
    int width = 0;
    int height = 0;
    std::vector<std::vector<Cell>> orientations;
    long long budget = 100'000'000;
    int cacheMegabytes = 256;
    unsigned seed = 0;
    int pocketLimit = 2;  // pockets below this size are rejected; 0 or 1 turns the check off
};

[[noreturn]] void fail(const std::string& message) {
    std::fprintf(stderr, "rect_tiler: %s\n", message.c_str());
    std::exit(2);
}

std::vector<std::vector<Cell>> parseOrientations(const std::string& text) {
    std::vector<std::vector<Cell>> result;
    std::stringstream groups(text);
    std::string group;
    while (std::getline(groups, group, '|')) {
        std::vector<Cell> cells;
        std::stringstream items(group);
        std::string item;
        while (items >> item) {
            const auto comma = item.find(',');
            if (comma == std::string::npos) fail("bad cell '" + item + "'");
            cells.push_back({std::stoi(item.substr(0, comma)), std::stoi(item.substr(comma + 1))});
        }
        if (cells.empty()) fail("empty orientation");
        result.push_back(cells);
    }
    if (result.empty()) fail("no orientations");
    for (const auto& cells : result)
        if (cells.size() != result[0].size()) fail("orientations differ in size");
    return result;
}

Options parseOptions(int argc, char** argv) {
    Options options;
    for (int i = 1; i < argc; i++) {
        const std::string name = argv[i];
        if (name == "--help") {
            std::puts("rect_tiler --width W --height H --orientations \"x,y x,y|...\" "
                      "[--budget NODES] [--cache-mb M] [--seed S] [--pocket-limit P]");
            std::exit(0);
        }
        if (i + 1 >= argc) fail("missing value for " + name);
        const std::string value = argv[++i];
        if (name == "--width") options.width = std::stoi(value);
        else if (name == "--height") options.height = std::stoi(value);
        else if (name == "--orientations") options.orientations = parseOrientations(value);
        else if (name == "--budget") options.budget = std::stoll(value);
        else if (name == "--cache-mb") options.cacheMegabytes = std::stoi(value);
        else if (name == "--seed") options.seed = static_cast<unsigned>(std::stoul(value));
        else if (name == "--pocket-limit") options.pocketLimit = std::stoi(value);
        else fail("unknown option " + name);
    }
    if (options.width < 1 || options.height < 1) fail("--width and --height must be positive");
    if (options.orientations.empty()) fail("--orientations is required");
    if (options.budget < 1) fail("--budget must be positive");
    if (options.cacheMegabytes < 1 || options.cacheMegabytes > 65536) fail("--cache-mb must be in 1..65536");
    return options;
}

std::uint64_t mix(std::uint64_t value) {
    value ^= value >> 33;
    value *= 0xff51afd7ed558ccdULL;
    value ^= value >> 33;
    value *= 0xc4ceb9fe1a85ec53ULL;
    value ^= value >> 33;
    return value;
}

template <int WORDS>
struct Window {
    std::array<std::uint64_t, WORDS> words{};

    bool overlaps(const Window& other) const {
        for (int i = 0; i < WORDS; i++)
            if (words[i] & other.words[i]) return true;
        return false;
    }

    void add(const Window& other) {
        for (int i = 0; i < WORDS; i++) words[i] |= other.words[i];
    }

    void set(int bit) { words[bit >> 6] |= std::uint64_t{1} << (bit & 63); }

    bool test(long long bit) const {
        return bit < WORDS * 64 && ((words[bit >> 6] >> (bit & 63)) & 1) != 0;
    }

    /** Number of filled cells from bit 0 up to the first empty one. */
    int leadingFilled() const {
        int count = 0;
        for (int i = 0; i < WORDS; i++) {
            if (words[i] == ~std::uint64_t{0}) {
                count += 64;
                continue;
            }
            return count + __builtin_ctzll(~words[i]);
        }
        return count;
    }

    void shiftDown(int bits) {
        const int wordShift = bits >> 6;
        const int bitShift = bits & 63;
        for (int i = 0; i < WORDS; i++) {
            const int from = i + wordShift;
            std::uint64_t value = from < WORDS ? words[from] >> bitShift : 0;
            if (bitShift != 0 && from + 1 < WORDS) value |= words[from + 1] << (64 - bitShift);
            words[i] = value;
        }
    }

    std::uint64_t hash(long long position) const {
        std::uint64_t value = mix(static_cast<std::uint64_t>(position) + 0x9e3779b97f4a7c15ULL);
        for (int i = 0; i < WORDS; i++) value = mix(value ^ words[i]) + i;
        return value;
    }
};

/**
 * Set of frontier states known to lead nowhere, keyed exactly (no hash-only matches): 4-way buckets,
 * and a full bucket evicts one entry. Eviction only costs repeated work, so an exhausted search
 * is a proof that no tiling exists.
 */
template <int WORDS>
class FailedStates {
public:
    explicit FailedStates(int bits) : slots_(std::size_t{1} << bits), mask_((std::size_t{1} << bits) - 1) {}

    /** The largest power-of-two slot count that fits in the given memory, at least one bucket. */
    static int bitsFor(int megabytes) {
        const std::size_t slots = (static_cast<std::size_t>(megabytes) << 20) / sizeof(Slot);
        int bits = 2;
        while ((std::size_t{1} << (bits + 1)) <= slots) bits++;
        return bits;
    }

    bool contains(long long position, const Window<WORDS>& window) const {
        const std::size_t base = window.hash(position) & mask_ & ~(WAYS - 1);
        for (std::size_t i = 0; i < WAYS; i++) {
            const Slot& slot = slots_[base + i];
            if (slot.position == position && slot.window.words == window.words) return true;
        }
        return false;
    }

    void insert(long long position, const Window<WORDS>& window) {
        const std::uint64_t hash = window.hash(position);
        const std::size_t base = hash & mask_ & ~(WAYS - 1);
        std::size_t target = base + ((hash >> 40) & (WAYS - 1));
        for (std::size_t i = 0; i < WAYS; i++)
            if (slots_[base + i].position < 0) {
                target = base + i;
                break;
            }
        slots_[target] = {position, window};
    }

private:
    struct Slot {
        long long position = -1;
        Window<WORDS> window;
    };
    static constexpr std::size_t WAYS = 4;
    std::vector<Slot> slots_;
    std::size_t mask_;
};

/** One orientation seen from its anchor: its first cell in column-major order. */
template <int WORDS>
struct Anchored {
    int index;
    int anchorX;
    int anchorY;
    int minDy;
    int maxDy;
    int maxDx;
    Window<WORDS> mask;
    std::vector<Cell> neighbors;  // cells next to the copy, relative to the anchor
};

/**
 * True when an empty cell next to the copy just placed lies in an empty pocket smaller than one
 * copy: such a pocket can never be filled. Cells before `position` are full; walls count as full.
 */
template <int WORDS>
bool closesSmallPocket(const Window<WORDS>& window, long long position, long long anchorColumn, int anchorRow,
                       const Anchored<WORDS>& a, int width, int height, int limit) {
    const auto isEmpty = [&](long long x, long long y) {
        if (x < 0 || x >= width || y < 0 || y >= height) return false;
        const long long cell = x * height + y;
        return cell >= position && !window.test(cell - position);
    };
    std::array<Cell, 64> region{};
    for (const Cell& n : a.neighbors) {
        const long long x0 = anchorColumn + n.x;
        const long long y0 = anchorRow + n.y;
        if (!isEmpty(x0, y0)) continue;
        int count = 1;
        region[0] = {static_cast<int>(x0 - anchorColumn), static_cast<int>(y0)};
        for (int head = 0; head < count && count < limit; head++) {
            const Cell c = region[head];
            static constexpr int DX[4] = {1, -1, 0, 0};
            static constexpr int DY[4] = {0, 0, 1, -1};
            for (int d = 0; d < 4 && count < limit; d++) {
                const Cell m{c.x + DX[d], c.y + DY[d]};
                if (!isEmpty(anchorColumn + m.x, m.y)) continue;
                bool seen = false;
                for (int k = 0; k < count && !seen; k++) seen = region[k].x == m.x && region[k].y == m.y;
                if (!seen) region[count++] = m;
            }
        }
        if (count < limit) return true;
    }
    return false;
}

template <int WORDS>
int run(const Options& options) {
    const int height = options.height;
    const long long area = static_cast<long long>(options.width) * height;
    const int cellsPerCopy = static_cast<int>(options.orientations[0].size());
    if (area % cellsPerCopy != 0) {
        std::printf("{\"result\":\"exhausted\",\"nodes\":0}\n");
        return 0;
    }

    std::vector<Anchored<WORDS>> anchored;
    for (int index = 0; index < static_cast<int>(options.orientations.size()); index++) {
        const auto& cells = options.orientations[index];
        Cell anchor = cells[0];
        for (const Cell& c : cells)
            if (c.x < anchor.x || (c.x == anchor.x && c.y < anchor.y)) anchor = c;
        Anchored<WORDS> a{index, anchor.x, anchor.y, 0, 0, 0, {}, {}};
        for (const Cell& c : cells) {
            const int dx = c.x - anchor.x;
            const int dy = c.y - anchor.y;
            a.minDy = std::min(a.minDy, dy);
            a.maxDy = std::max(a.maxDy, dy);
            a.maxDx = std::max(a.maxDx, dx);
            a.mask.set(dx * height + dy);
        }
        for (const Cell& c : cells) {
            static constexpr int DX[4] = {1, -1, 0, 0};
            static constexpr int DY[4] = {0, 0, 1, -1};
            for (int d = 0; d < 4; d++) {
                const Cell n{c.x + DX[d] - anchor.x, c.y + DY[d] - anchor.y};
                bool taken = false;
                for (const Cell& o : cells) taken |= o.x - anchor.x == n.x && o.y - anchor.y == n.y;
                for (const Cell& o : a.neighbors) taken |= o.x == n.x && o.y == n.y;
                if (!taken) a.neighbors.push_back(n);
            }
        }
        anchored.push_back(a);
    }

    // Per anchor row, the orientations that stay inside the rectangle vertically, in a seeded order.
    std::mt19937 random(options.seed);
    std::vector<std::vector<int>> byRow(height);
    for (int row = 0; row < height; row++) {
        for (int i = 0; i < static_cast<int>(anchored.size()); i++)
            if (row + anchored[i].minDy >= 0 && row + anchored[i].maxDy < height) byRow[row].push_back(i);
        if (options.seed != 0) std::shuffle(byRow[row].begin(), byRow[row].end(), random);
    }

    const int pocketLimit = std::min({options.pocketLimit, cellsPerCopy, 64});
    struct Frame {
        long long position;
        Window<WORDS> window;
        int nextChoice;
        int placed;  // index into anchored of the copy covering this frame's first cell
    };
    std::vector<Frame> stack;
    stack.reserve(static_cast<std::size_t>(area / cellsPerCopy) + 1);
    stack.push_back({0, {}, 0, -1});
    FailedStates<WORDS> failed(FailedStates<WORDS>::bitsFor(options.cacheMegabytes));
    long long nodes = 0;
    bool found = false;

    while (!stack.empty()) {
        Frame& frame = stack.back();
        const int row = static_cast<int>(frame.position % height);
        const long long column = frame.position / height;
        const auto& choices = byRow[row];
        bool pushed = false;
        while (frame.nextChoice < static_cast<int>(choices.size())) {
            const auto& a = anchored[choices[frame.nextChoice++]];
            if (column + a.maxDx >= options.width) continue;
            if (frame.window.overlaps(a.mask)) continue;
            Window<WORDS> next = frame.window;
            next.add(a.mask);
            const int filled = next.leadingFilled();
            next.shiftDown(filled);
            const long long position = frame.position + filled;
            if (position == area) {
                frame.placed = static_cast<int>(&a - anchored.data());
                found = true;
                break;
            }
            if (failed.contains(position, next)) continue;
            if (pocketLimit > 1 && closesSmallPocket(next, position, column, row, a, options.width, height, pocketLimit))
                continue;
            if (++nodes > options.budget) {
                std::printf("{\"result\":\"budget\",\"nodes\":%lld}\n", nodes);
                return 0;
            }
            frame.placed = static_cast<int>(&a - anchored.data());
            stack.push_back({position, next, 0, -1});
            pushed = true;
            break;
        }
        if (found) break;
        if (pushed) continue;
        failed.insert(frame.position, frame.window);
        stack.pop_back();
    }

    if (!found) {
        std::printf("{\"result\":\"exhausted\",\"nodes\":%lld}\n", nodes);
        return 0;
    }
    std::string out = "{\"result\":\"found\",\"nodes\":" + std::to_string(nodes) + ",\"placements\":[";
    for (std::size_t i = 0; i < stack.size(); i++) {
        const Frame& frame = stack[i];
        const auto& a = anchored[frame.placed];
        const long long x = frame.position / height - a.anchorX;
        const long long y = frame.position % height - a.anchorY;
        if (i > 0) out += ',';
        out += "[" + std::to_string(a.index) + "," + std::to_string(x) + "," + std::to_string(y) + "]";
    }
    out += "]}";
    std::puts(out.c_str());
    return 0;
}

}  // namespace

int main(int argc, char** argv) {
    try {
        const Options options = parseOptions(argc, argv);
        int reach = 0;
        for (const auto& cells : options.orientations) {
            int minX = cells[0].x, maxX = cells[0].x;
            for (const Cell& c : cells) {
                minX = std::min(minX, c.x);
                maxX = std::max(maxX, c.x);
            }
            reach = std::max(reach, maxX - minX + 1);
        }
        const long long bits = static_cast<long long>(reach) * options.height;
        if (bits <= 64) return run<1>(options);
        if (bits <= 128) return run<2>(options);
        if (bits <= 256) return run<4>(options);
        if (bits <= 512) return run<8>(options);
        if (bits <= 1024) return run<16>(options);
        if (bits <= 2048) return run<32>(options);
        fail("rectangle side too long for the frontier window (" + std::to_string(bits) + " bits)");
    } catch (const std::exception& error) {
        fail(error.what());
    }
}
